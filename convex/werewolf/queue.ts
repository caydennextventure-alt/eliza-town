import { anyApi } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { DatabaseReader, DatabaseWriter } from '../_generated/server';
import { mutation, query } from '../_generated/server';
import type { SerializedWorldMap } from '../aiTown/worldMap';
import { playerId } from '../aiTown/ids';
import { appendMatchEvents } from './db';
import { createMatchCreatedEvent } from './engine/events';
import { createIdempotencyStore, IDEMPOTENCY_SCOPES, runWithIdempotency } from './idempotency';
import { planMatchCreation } from './matchmaking';
import type { BuildingLocation, MatchCreationPlan, QueueEntrySeed } from './matchmaking';
import type { Phase } from './types';

const internalScheduler = anyApi;

export const DEFAULT_QUEUE_ID = 'werewolf-default';
export const REQUIRED_PLAYERS = 8;

const DISPLAY_NAME_MAX = 32;
const IDEMPOTENCY_KEY_MIN = 8;
const IDEMPOTENCY_KEY_MAX = 128;

export type QueueEntry = {
  playerId: string;
  joinedAt: number;
};

type QueueEntryDoc = Doc<'werewolfQueue'>;

export type QueueStatus = {
  queueId: string;
  position: number | null;
  size: number;
  requiredPlayers: number;
  status: 'WAITING' | 'STARTING';
  estimatedStartSeconds: number;
};

export type QueueSummary = {
  queueId: string;
  size: number;
  requiredPlayers: number;
};

export type MatchAssignment = {
  matchId: string;
  buildingInstanceId: string;
  seat: number;
};

export type QueueStatusResult = {
  queue: QueueStatus;
  matchAssignment: MatchAssignment | null;
};

export type QueueLeaveResult = {
  removed: boolean;
  queue: QueueSummary;
};

export type InitialPhaseAdvanceJob = {
  delayMs: number;
  args: {
    matchId: string;
    expectedPhase: Phase;
    expectedPhaseEndsAt: number;
  };
};

export function assertSupportedQueueId(queueId: string): string {
  if (queueId !== DEFAULT_QUEUE_ID) {
    throw new ConvexError(`Unsupported queueId: ${queueId}`);
  }
  return queueId;
}

export function normalizePreferredDisplayName(
  preferredDisplayName?: string,
): string | undefined {
  if (preferredDisplayName === undefined) {
    return undefined;
  }
  const trimmed = preferredDisplayName.trim();
  if (trimmed.length === 0) {
    throw new ConvexError('Display name cannot be empty.');
  }
  if (trimmed.length > DISPLAY_NAME_MAX) {
    throw new ConvexError(`Display name exceeds ${DISPLAY_NAME_MAX} characters.`);
  }
  return trimmed;
}

export function validateIdempotencyKey(idempotencyKey?: string): void {
  if (idempotencyKey === undefined) {
    return;
  }
  if (
    idempotencyKey.length < IDEMPOTENCY_KEY_MIN ||
    idempotencyKey.length > IDEMPOTENCY_KEY_MAX
  ) {
    throw new ConvexError('Idempotency key length is invalid.');
  }
}

export function buildQueueStatus(
  queueId: string,
  entries: QueueEntry[],
  playerId: string | null,
): QueueStatus {
  const sorted = [...entries].sort((a, b) => a.joinedAt - b.joinedAt);
  const size = sorted.length;
  const position =
    playerId === null
      ? null
      : (() => {
          const index = sorted.findIndex((entry) => entry.playerId === playerId);
          return index === -1 ? null : index + 1;
        })();

  return {
    queueId,
    position,
    size,
    requiredPlayers: REQUIRED_PLAYERS,
    status: size >= REQUIRED_PLAYERS ? 'STARTING' : 'WAITING',
    estimatedStartSeconds: 0,
  };
}

export function buildQueueSummary(queueId: string, entries: QueueEntry[]): QueueSummary {
  return {
    queueId,
    size: entries.length,
    requiredPlayers: REQUIRED_PLAYERS,
  };
}

export function buildInitialPhaseAdvanceJob(params: {
  matchId: string;
  phase: Phase;
  phaseEndsAt: number;
  now: number;
}): InitialPhaseAdvanceJob | null {
  if (params.phase === 'ENDED') {
    return null;
  }
  return {
    delayMs: Math.max(0, params.phaseEndsAt - params.now),
    args: {
      matchId: params.matchId,
      expectedPhase: params.phase,
      expectedPhaseEndsAt: params.phaseEndsAt,
    },
  };
}

export const queueJoin = mutation({
  args: {
    playerId,
    queueId: v.optional(v.string()),
    preferredDisplayName: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<QueueStatusResult> => {
    const queueId = assertSupportedQueueId(args.queueId ?? DEFAULT_QUEUE_ID);
    const preferredDisplayName = normalizePreferredDisplayName(args.preferredDisplayName);
    validateIdempotencyKey(args.idempotencyKey);

    const { result } = await runWithIdempotency({
      store: createIdempotencyStore(ctx.db),
      scope: IDEMPOTENCY_SCOPES.queueJoin,
      key: args.idempotencyKey,
      playerId: args.playerId,
      now: Date.now(),
      run: async () => {
        const existingMatchAssignment = await findActiveMatchAssignment(ctx.db, args.playerId);
        const existing = await ctx.db
          .query('werewolfQueue')
          .withIndex('byQueueAndPlayer', (q) =>
            q.eq('queueId', queueId).eq('playerId', args.playerId),
          )
          .first();

        if (!existing && !existingMatchAssignment) {
          const worldId = await getDefaultWorldId(ctx.db);
          const displayName = await resolveDisplayName(
            ctx.db,
            worldId,
            args.playerId,
            preferredDisplayName,
          );
          await ctx.db.insert('werewolfQueue', {
            queueId,
            worldId,
            playerId: args.playerId,
            displayName,
            joinedAt: Date.now(),
            idempotencyKey: args.idempotencyKey,
          });
        }

        const queueEntryDocs = await loadQueueEntryDocs(ctx.db, queueId);
        const createdMatch = await maybeCreateMatchFromQueue(ctx.db, queueId, queueEntryDocs);
        if (createdMatch) {
          const schedule = buildInitialPhaseAdvanceJob({
            matchId: createdMatch.matchId,
            phase: createdMatch.phase,
            phaseEndsAt: createdMatch.phaseEndsAt,
            now: Date.now(),
          });
          if (schedule) {
            await ctx.scheduler.runAfter(
              schedule.delayMs,
              internalScheduler.werewolf.advancePhase.advancePhase,
              schedule.args,
            );
          }
        }

        const queueEntries = await loadQueueEntries(ctx.db, queueId);
        const matchAssignment = await findActiveMatchAssignment(ctx.db, args.playerId);
        return {
          queue: buildQueueStatus(queueId, queueEntries, args.playerId),
          matchAssignment,
        };
      },
    });

    return result;
  },
});

export const queueLeave = mutation({
  args: {
    playerId,
    queueId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<QueueLeaveResult> => {
    const queueId = assertSupportedQueueId(args.queueId ?? DEFAULT_QUEUE_ID);
    validateIdempotencyKey(args.idempotencyKey);

    const { result } = await runWithIdempotency({
      store: createIdempotencyStore(ctx.db),
      scope: IDEMPOTENCY_SCOPES.queueLeave,
      key: args.idempotencyKey,
      playerId: args.playerId,
      now: Date.now(),
      run: async () => {
        const existing = await ctx.db
          .query('werewolfQueue')
          .withIndex('byQueueAndPlayer', (q) =>
            q.eq('queueId', queueId).eq('playerId', args.playerId),
          )
          .first();

        let removed = false;
        if (existing) {
          await ctx.db.delete(existing._id);
          removed = true;
        }

        const queueEntries = await loadQueueEntries(ctx.db, queueId);
        return {
          removed,
          queue: buildQueueSummary(queueId, queueEntries),
        };
      },
    });

    return result;
  },
});

export const queueStatus = query({
  args: {
    playerId,
    queueId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<QueueStatusResult> => {
    const queueId = assertSupportedQueueId(args.queueId ?? DEFAULT_QUEUE_ID);
    const queueEntries = await loadQueueEntries(ctx.db, queueId);
    const matchAssignment = await findActiveMatchAssignment(ctx.db, args.playerId);
    return {
      queue: buildQueueStatus(queueId, queueEntries, args.playerId),
      matchAssignment,
    };
  },
});

async function getDefaultWorldId(db: DatabaseReader): Promise<Id<'worlds'>> {
  const worldStatus = await db
    .query('worldStatus')
    .filter((q) => q.eq(q.field('isDefault'), true))
    .unique();
  if (!worldStatus) {
    throw new ConvexError('No default world found.');
  }
  return worldStatus.worldId;
}

async function resolveDisplayName(
  db: DatabaseReader,
  worldId: Id<'worlds'>,
  playerId: string,
  preferredDisplayName?: string,
): Promise<string> {
  if (preferredDisplayName) {
    return preferredDisplayName;
  }
  const description = await db
    .query('playerDescriptions')
    .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', playerId))
    .first();
  return description?.name ?? playerId;
}

async function loadQueueEntryDocs(
  db: DatabaseReader,
  queueId: string,
): Promise<QueueEntryDoc[]> {
  return await db
    .query('werewolfQueue')
    .withIndex('byQueueAndJoinedAt', (q) => q.eq('queueId', queueId))
    .order('asc')
    .collect();
}

async function loadQueueEntries(db: DatabaseReader, queueId: string): Promise<QueueEntry[]> {
  const entries = await loadQueueEntryDocs(db, queueId);
  return entries.map((entry) => ({
    playerId: entry.playerId,
    joinedAt: entry.joinedAt,
  }));
}

async function maybeCreateMatchFromQueue(
  db: DatabaseWriter,
  queueId: string,
  queueEntryDocs: QueueEntryDoc[],
): Promise<{ matchId: string; phase: Phase; phaseEndsAt: number } | null> {
  if (queueEntryDocs.length < REQUIRED_PLAYERS) {
    return null;
  }

  const sortedEntries = sortQueueEntries(queueEntryDocs);
  const selectedEntries = sortedEntries.slice(0, REQUIRED_PLAYERS);
  const worldId = assertSameWorld(selectedEntries);
  const worldMap = await loadWorldMap(db, worldId);
  const occupiedPositions = await loadExistingBuildingPositions(db, worldId);
  const now = Date.now();

  const plan = planMatchCreation({
    queueId,
    entries: buildQueueEntrySeeds(selectedEntries),
    now,
    worldMap,
    requiredPlayers: REQUIRED_PLAYERS,
    occupiedPositions,
  });

  if (!plan) {
    return null;
  }

  const createdMatch = await createMatchFromPlan(db, queueId, worldId, plan);
  await removeQueueEntries(db, selectedEntries);
  return {
    matchId: createdMatch.matchId,
    phase: plan.matchState.phase,
    phaseEndsAt: plan.matchState.phaseEndsAt,
  };
}

function sortQueueEntries(entries: QueueEntryDoc[]): QueueEntryDoc[] {
  return [...entries].sort((a, b) => {
    if (a.joinedAt !== b.joinedAt) {
      return a.joinedAt - b.joinedAt;
    }
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });
}

function buildQueueEntrySeeds(entries: QueueEntryDoc[]): QueueEntrySeed[] {
  return entries.map((entry) => ({
    playerId: entry.playerId,
    displayName: entry.displayName,
    joinedAt: entry.joinedAt,
  }));
}

function assertSameWorld(entries: QueueEntryDoc[]): Id<'worlds'> {
  if (entries.length === 0) {
    throw new ConvexError('Cannot create match from an empty queue');
  }
  const worldId = entries[0].worldId;
  for (const entry of entries) {
    if (entry.worldId !== worldId) {
      throw new ConvexError('Queue entries span multiple worlds');
    }
  }
  return worldId;
}

async function loadWorldMap(
  db: DatabaseReader,
  worldId: Id<'worlds'>,
): Promise<SerializedWorldMap> {
  const worldMapDoc = await db
    .query('maps')
    .withIndex('worldId', (q) => q.eq('worldId', worldId))
    .unique();
  if (!worldMapDoc) {
    throw new ConvexError(`No map found for world ${worldId}`);
  }
  const { _id, _creationTime, worldId: _mapWorldId, ...worldMap } = worldMapDoc;
  return worldMap;
}

async function loadExistingBuildingPositions(
  db: DatabaseReader,
  worldId: Id<'worlds'>,
): Promise<BuildingLocation[]> {
  const buildings = await db
    .query('werewolfBuildings')
    .withIndex('byWorld', (q) => q.eq('worldId', worldId))
    .collect();
  return buildings.map((building) => ({ x: building.x, y: building.y }));
}

async function createMatchFromPlan(
  db: DatabaseWriter,
  queueId: string,
  worldId: Id<'worlds'>,
  plan: MatchCreationPlan,
): Promise<{ matchId: string; buildingInstanceId: string }> {
  const now = plan.matchState.startedAt;
  const matchId = await db.insert('werewolfMatches', {
    worldId,
    queueId,
    buildingInstanceId: 'pending',
    phase: plan.matchState.phase,
    dayNumber: plan.matchState.dayNumber,
    nightNumber: plan.matchState.nightNumber,
    phaseStartedAt: plan.matchState.phaseStartedAt,
    phaseEndsAt: plan.matchState.phaseEndsAt,
    playersAlive: plan.matchState.playersAlive,
    startedAt: plan.matchState.startedAt,
    publicSummary: plan.matchState.publicSummary,
  });
  const matchIdString = matchId as string;

  for (const player of plan.matchState.players) {
    await db.insert('werewolfPlayers', {
      matchId: matchIdString,
      playerId: player.playerId,
      displayName: player.displayName,
      seat: player.seat,
      role: player.role,
      alive: player.alive,
      ready: player.ready,
      seerHistory: player.seerHistory,
    });
  }

  const buildingId = await db.insert('werewolfBuildings', {
    matchId: matchIdString,
    worldId,
    x: plan.buildingLocation.x,
    y: plan.buildingLocation.y,
    label: buildMatchLabel(matchIdString),
    createdAt: now,
  });
  const buildingInstanceId = buildingId as string;

  await db.patch(matchId, { buildingInstanceId });

  const createdEvent = createMatchCreatedEvent({
    at: now,
    players: plan.matchState.players.map((player) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      seat: player.seat,
    })),
    phaseEndsAt: plan.matchState.phaseEndsAt,
  });
  await appendMatchEvents(db, matchIdString, [createdEvent]);

  return { matchId: matchIdString, buildingInstanceId };
}

async function removeQueueEntries(
  db: DatabaseWriter,
  entries: QueueEntryDoc[],
): Promise<void> {
  for (const entry of entries) {
    await db.delete(entry._id);
  }
}

function buildMatchLabel(matchId: string): string {
  const suffix = matchId.slice(-4);
  return `Werewolf Match ${suffix}`;
}

async function findActiveMatchAssignment(
  db: DatabaseReader,
  playerId: string,
): Promise<MatchAssignment | null> {
  const playerDocs = await db
    .query('werewolfPlayers')
    .withIndex('byPlayerId', (q) => q.eq('playerId', playerId))
    .collect();
  playerDocs.sort((a, b) => b._creationTime - a._creationTime);

  for (const playerDoc of playerDocs) {
    const matchDoc = await db.get(playerDoc.matchId as Id<'werewolfMatches'>);
    if (!matchDoc) {
      continue;
    }
    if (matchDoc.phase === 'ENDED' || matchDoc.endedAt !== undefined) {
      continue;
    }
    return {
      matchId: matchDoc._id as string,
      buildingInstanceId: matchDoc.buildingInstanceId,
      seat: playerDoc.seat,
    };
  }
  return null;
}
