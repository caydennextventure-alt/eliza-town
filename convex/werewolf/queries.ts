import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { DatabaseReader } from '../_generated/server';
import { query } from '../_generated/server';
import { playerId } from '../aiTown/ids';
import { loadMatchSnapshot, matchSnapshotToState } from './db';
import { computeRequiredAction } from './engine/state';
import type { MatchPlayerState, MatchState, SeerInspection } from './engine/state';
import type { EventVisibility, MatchId, Phase, PlayerId, Role, RequiredAction } from './types';
import { isPlayerPrivateVisibility } from './types';

const DEFAULT_MATCHES_LIST_LIMIT = 20;
const MAX_MATCHES_LIST_LIMIT = 50;
const DEFAULT_RECENT_MESSAGES_LIMIT = 20;
const MAX_RECENT_MESSAGES_LIMIT = 50;
const DEFAULT_EVENTS_LIMIT = 50;
const MAX_EVENTS_LIMIT = 200;

type MatchListStatus = 'ACTIVE' | 'ENDED' | 'ALL';

export type MatchListEntry = {
  matchId: string;
  buildingInstanceId: string;
  phase: Phase;
  dayNumber: number;
  playersAlive: number;
  startedAt: string;
};

export type MatchesListResult = {
  matches: MatchListEntry[];
};

export type MatchBuildingView = {
  matchId: string;
  buildingId: string;
  worldId: string;
  x: number;
  y: number;
  label: string;
};

export type MatchBuildingResult = {
  building: MatchBuildingView | null;
};

export type BuildingsInWorldResult = {
  buildings: MatchBuildingView[];
};

export type RecentPublicMessage = {
  eventId: string;
  at: string;
  playerId: string;
  text: string;
};

export type MatchPlayerView = {
  playerId: string;
  displayName: string;
  seat: number;
  alive: boolean;
  revealedRole: Role | null;
};

export type MatchYouView = {
  playerId: string;
  role: Role;
  alive: boolean;
  knownWolves: PlayerId[];
  seerHistory: SeerInspection[];
  requiredAction: RequiredAction;
};

export type MatchStateView = {
  matchId: string;
  phase: Phase;
  dayNumber: number;
  phaseEndsAt: string;
  players: MatchPlayerView[];
  publicSummary: string;
  recentPublicMessages: RecentPublicMessage[];
  you: MatchYouView | null;
};

export type MatchGetStateResult = {
  state: MatchStateView;
};

export type MatchEventDoc = {
  seq: number;
  at: number;
  type: string;
  visibility: EventVisibility;
  payload: unknown;
};

export type MatchEventView = {
  eventId: string;
  at: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  type: string;
  payload: Record<string, unknown>;
};

export type MatchEventsResult = {
  matchId: string;
  events: MatchEventView[];
};

type ViewerContext =
  | { kind: 'spectator' }
  | { kind: 'player'; player: MatchPlayerState }
  | { kind: 'spoiler' };

export function resolveViewerContext(
  players: MatchPlayerState[],
  viewerPlayerId?: PlayerId | null,
  includeSpoilers?: boolean,
): ViewerContext {
  if (includeSpoilers) {
    return { kind: 'spoiler' };
  }
  if (!viewerPlayerId) {
    return { kind: 'spectator' };
  }
  const player = players.find((entry) => entry.playerId === viewerPlayerId);
  if (!player) {
    return { kind: 'spectator' };
  }
  return { kind: 'player', player };
}

export function filterVisibleEvents(
  events: MatchEventDoc[],
  viewer: ViewerContext,
): MatchEventDoc[] {
  if (viewer.kind === 'spoiler') {
    return events;
  }
  return events.filter((event) => isEventVisibleToViewer(event.visibility, viewer));
}

export function buildMatchStateView(params: {
  matchId: MatchId;
  state: MatchState;
  viewerPlayerId?: PlayerId | null;
  includeSpoilers?: boolean;
  includeTranscriptSummary?: boolean;
  recentPublicMessages?: RecentPublicMessage[];
}): MatchStateView {
  const viewer = resolveViewerContext(params.state.players, params.viewerPlayerId);
  const publicSummary =
    params.includeTranscriptSummary === false ? '' : params.state.publicSummary;
  const revealAllRoles =
    params.includeSpoilers === true ||
    params.state.phase === 'ENDED' ||
    params.state.endedAt !== undefined;

  const players = params.state.players.map((player) => ({
    playerId: player.playerId,
    displayName: player.displayName,
    seat: player.seat,
    alive: player.alive,
    revealedRole:
      revealAllRoles || !player.alive || player.revealedRole ? player.role : null,
  }));

  const you =
    viewer.kind === 'player' ? buildYouView(params.state, viewer.player) : null;

  return {
    matchId: params.matchId,
    phase: params.state.phase,
    dayNumber: params.state.dayNumber,
    phaseEndsAt: toIsoString(params.state.phaseEndsAt),
    players,
    publicSummary,
    recentPublicMessages: params.recentPublicMessages ?? [],
    you,
  };
}

export const matchesList = query({
  args: {
    status: v.optional(v.union(v.literal('ACTIVE'), v.literal('ENDED'), v.literal('ALL'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MatchesListResult> => {
    const status = normalizeStatus(args.status);
    const limit = normalizeLimit(args.limit, DEFAULT_MATCHES_LIST_LIMIT, 1, MAX_MATCHES_LIST_LIMIT);

    const matches = await ctx.db.query('werewolfMatches').collect();
    const filtered = matches.filter((match) => includeMatchForStatus(match, status));
    filtered.sort((a, b) => b.startedAt - a.startedAt);

    return {
      matches: filtered.slice(0, limit).map((match) => ({
        matchId: match._id as string,
        buildingInstanceId: match.buildingInstanceId,
        phase: match.phase,
        dayNumber: match.dayNumber,
        playersAlive: match.playersAlive,
        startedAt: toIsoString(match.startedAt),
      })),
    };
  },
});

export const matchBuildingGet = query({
  args: {
    matchId: v.string(),
  },
  handler: async (ctx, args): Promise<MatchBuildingResult> => {
    const building = await ctx.db
      .query('werewolfBuildings')
      .withIndex('byMatch', (q) => q.eq('matchId', args.matchId))
      .unique();
    if (!building) {
      return { building: null };
    }
    return {
      building: buildMatchBuildingView(building),
    };
  },
});

export const buildingsInWorld = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args): Promise<BuildingsInWorldResult> => {
    const buildings = await ctx.db
      .query('werewolfBuildings')
      .withIndex('byWorld', (q) => q.eq('worldId', args.worldId))
      .collect();
    const active: MatchBuildingView[] = [];

    for (const building of buildings) {
      const match = await ctx.db.get(building.matchId as Id<'werewolfMatches'>);
      if (!match || !isMatchActive(match)) {
        continue;
      }
      active.push(buildMatchBuildingView(building));
    }

    return { buildings: active };
  },
});

export const matchGetState = query({
  args: {
    playerId: v.optional(playerId),
    matchId: v.string(),
    includeSpoilers: v.optional(v.boolean()),
    includeTranscriptSummary: v.optional(v.boolean()),
    includeRecentPublicMessages: v.optional(v.boolean()),
    recentPublicMessagesLimit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MatchGetStateResult> => {
    const snapshot = await loadMatchSnapshot(ctx.db, args.matchId as MatchId);
    const state = matchSnapshotToState(snapshot);
    const includeSpoilers = args.includeSpoilers ?? false;
    const includeTranscriptSummary = args.includeTranscriptSummary ?? true;
    const includeRecentPublicMessages = args.includeRecentPublicMessages ?? false;
    const limit = normalizeLimit(
      args.recentPublicMessagesLimit,
      DEFAULT_RECENT_MESSAGES_LIMIT,
      1,
      MAX_RECENT_MESSAGES_LIMIT,
    );

    const recentPublicMessages = includeRecentPublicMessages
      ? await loadRecentPublicMessages(ctx.db, args.matchId as MatchId, limit)
      : [];

    return {
      state: buildMatchStateView({
        matchId: snapshot.match._id as string,
        state,
        viewerPlayerId: args.playerId as PlayerId | undefined,
        includeSpoilers,
        includeTranscriptSummary,
        recentPublicMessages,
      }),
    };
  },
});

export const matchEventsGet = query({
  args: {
    playerId: v.optional(playerId),
    matchId: v.string(),
    includeSpoilers: v.optional(v.boolean()),
    afterEventId: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MatchEventsResult> => {
    const snapshot = await loadMatchSnapshot(ctx.db, args.matchId as MatchId);
    const state = matchSnapshotToState(snapshot);
    const viewer = resolveViewerContext(
      state.players,
      args.playerId as PlayerId | undefined,
      args.includeSpoilers ?? false,
    );
    const afterSeq = parseAfterEventId(args.afterEventId ?? null);
    const limit = normalizeLimit(args.limit, DEFAULT_EVENTS_LIMIT, 1, MAX_EVENTS_LIMIT);

    const events = await loadMatchEvents(ctx.db, args.matchId as MatchId, afterSeq);
    const visible = filterVisibleEvents(events, viewer);
    const selected = afterSeq === null ? visible.slice(-limit) : visible.slice(0, limit);

    return {
      matchId: snapshot.match._id as string,
      events: selected.map((event) => ({
        eventId: String(event.seq),
        at: toIsoString(event.at),
        visibility: event.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
        type: event.type,
        payload: normalizePayload(event.payload),
      })),
    };
  },
});

function buildYouView(state: MatchState, player: MatchPlayerState): MatchYouView {
  const knownWolves =
    player.role === 'WEREWOLF'
      ? state.players.filter((entry) => entry.role === 'WEREWOLF').map((entry) => entry.playerId)
      : [];

  return {
    playerId: player.playerId,
    role: player.role,
    alive: player.alive,
    knownWolves,
    seerHistory: player.role === 'SEER' ? player.seerHistory : [],
    requiredAction: computeRequiredAction(state, player.playerId),
  };
}

function isEventVisibleToViewer(visibility: EventVisibility, viewer: ViewerContext): boolean {
  if (visibility === 'PUBLIC') {
    return true;
  }
  if (viewer.kind !== 'player') {
    return false;
  }
  if (visibility === 'WOLVES') {
    return viewer.player.role === 'WEREWOLF';
  }
  if (isPlayerPrivateVisibility(visibility)) {
    return visibility.playerId === viewer.player.playerId;
  }
  return false;
}

function includeMatchForStatus(match: Doc<'werewolfMatches'>, status: MatchListStatus): boolean {
  if (status === 'ALL') {
    return true;
  }
  const active = isMatchActive(match);
  return status === 'ENDED' ? !active : active;
}

function normalizeStatus(status?: MatchListStatus): MatchListStatus {
  return status ?? 'ACTIVE';
}

function normalizeLimit(
  limit: number | undefined,
  defaultLimit: number,
  min: number,
  max: number,
): number {
  const resolved = limit ?? defaultLimit;
  if (!Number.isFinite(resolved) || !Number.isInteger(resolved)) {
    throw new ConvexError('Limit must be an integer.');
  }
  if (resolved < min || resolved > max) {
    throw new ConvexError(`Limit must be between ${min} and ${max}.`);
  }
  return resolved;
}

function parseAfterEventId(afterEventId: string | null): number | null {
  if (afterEventId === null) {
    return null;
  }
  const parsed = Number(afterEventId);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new ConvexError('Invalid afterEventId.');
  }
  return parsed;
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object') {
    return payload as Record<string, unknown>;
  }
  return {};
}

function toIsoString(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

export function buildMatchBuildingView(
  building: Doc<'werewolfBuildings'>,
): MatchBuildingView {
  return {
    matchId: building.matchId,
    buildingId: building._id as string,
    worldId: building.worldId as string,
    x: building.x,
    y: building.y,
    label: building.label,
  };
}

export function isMatchActive(match: Doc<'werewolfMatches'>): boolean {
  return match.phase !== 'ENDED' && match.endedAt === undefined;
}

async function loadMatchEvents(
  db: DatabaseReader,
  matchId: MatchId,
  afterSeq: number | null,
): Promise<MatchEventDoc[]> {
  const query = db.query('werewolfEvents').withIndex('byMatchAndSeq', (q) => {
    const base = q.eq('matchId', matchId);
    return afterSeq === null ? base : base.gt('seq', afterSeq);
  });
  return await query.order('asc').collect();
}

async function loadRecentPublicMessages(
  db: DatabaseReader,
  matchId: MatchId,
  limit: number,
): Promise<RecentPublicMessage[]> {
  const events = await loadMatchEvents(db, matchId, null);
  const messages: RecentPublicMessage[] = [];
  for (const event of events) {
    const message = extractPublicMessage(event);
    if (message) {
      messages.push(message);
    }
  }
  return messages.slice(-limit);
}

function extractPublicMessage(event: MatchEventDoc): RecentPublicMessage | null {
  if (event.type !== 'PUBLIC_MESSAGE' || event.visibility !== 'PUBLIC') {
    return null;
  }
  const payload = normalizePayload(event.payload);
  if (typeof payload.playerId !== 'string' || typeof payload.text !== 'string') {
    return null;
  }
  return {
    eventId: String(event.seq),
    at: toIsoString(event.at),
    playerId: payload.playerId,
    text: payload.text,
  };
}
