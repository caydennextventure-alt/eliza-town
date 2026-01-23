import { anyApi } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation } from '../_generated/server';
import { playerId } from '../aiTown/ids';
import { appendMatchEvents, loadMatchSnapshot, matchSnapshotToState, writeMatchState } from './db';
import { applyDayAction } from './engine/day';
import {
  createNarratorEvent,
  createPublicMessageEvent,
  createVoteCastEvent,
  createWolfChatMessageEvent,
} from './engine/events';
import { canAdvancePhaseEarly } from './engine/earlyAdvance';
import { createIdempotencyStore, IDEMPOTENCY_SCOPES, runWithIdempotency } from './idempotency';
import { applyNightAction } from './engine/night';
import type { WerewolfEvent } from './engine/events';
import type { MatchPlayerState, MatchState } from './engine/state';
import type { MatchId, PlayerId, PublicMessageKind } from './types';
import { isPublicMessageKind } from './types';
import { validateIdempotencyKey } from './queue';

const PUBLIC_MESSAGE_MIN = 1;
const PUBLIC_MESSAGE_MAX = 500;
const PUBLIC_MESSAGE_COOLDOWN_MS = 3_000;
const WOLF_CHAT_MIN = 1;
const WOLF_CHAT_MAX = 400;
const WOLF_CHAT_COOLDOWN_MS = 2_000;
const VOTE_REASON_MAX = 200;

const internalScheduler = anyApi;

export type MatchReadyResult = {
  matchId: string;
  playerId: string;
  ready: boolean;
};

export type MatchSayPublicResult = {
  matchId: string;
  eventId: string;
  message: {
    playerId: string;
    kind: PublicMessageKind;
    text: string;
  };
};

export type MatchVoteResult = {
  matchId: string;
  eventId: string;
  vote: {
    voterPlayerId: string;
    targetPlayerId: string | null;
  };
};

export type MatchWolfKillResult = {
  matchId: string;
  eventId: string;
  selection: {
    byPlayerId: string;
    targetPlayerId: string;
  };
};

export type MatchSeerInspectResult = {
  matchId: string;
  eventId: string;
  result: {
    targetPlayerId: string;
    alignment: 'WEREWOLF' | 'NOT_WEREWOLF';
  };
};

export type MatchDoctorProtectResult = {
  matchId: string;
  eventId: string;
  protection: {
    byPlayerId: string;
    targetPlayerId: string;
  };
};

export type MatchWolfChatResult = {
  matchId: string;
  eventId: string;
  message: {
    playerId: string;
    text: string;
  };
};

export type MatchReadyOutcome = {
  nextState: MatchState;
  event?: WerewolfEvent;
  ready: boolean;
  changed: boolean;
};

export function applyMatchReady(
  state: MatchState,
  playerId: PlayerId,
  now: number,
): MatchReadyOutcome {
  if (state.phase !== 'LOBBY') {
    throw new Error('Ready can only be handled during LOBBY');
  }

  const player = findPlayer(state, playerId);
  if (!player.alive) {
    throw new Error('Dead players cannot ready');
  }

  if (player.ready) {
    return { nextState: state, ready: true, changed: false };
  }

  const nextState = updatePlayerState(state, playerId, (current) => ({
    ...current,
    ready: true,
  }));

  const event = createNarratorEvent({
    at: now,
    text: `${player.displayName} is ready.`,
  });

  return {
    nextState,
    event,
    ready: true,
    changed: true,
  };
}

export type NormalizedPublicMessage = {
  text: string;
  kind: PublicMessageKind;
  replyToEventId: string | null;
};

export function normalizePublicMessageInput(params: {
  text: string;
  kind?: string;
  replyToEventId?: string | null;
}): NormalizedPublicMessage {
  const trimmed = params.text.trim();
  if (trimmed.length < PUBLIC_MESSAGE_MIN) {
    throw new ConvexError('Public message text cannot be empty.');
  }
  if (trimmed.length > PUBLIC_MESSAGE_MAX) {
    throw new ConvexError(`Public message exceeds ${PUBLIC_MESSAGE_MAX} characters.`);
  }

  const kind = params.kind ?? 'DISCUSSION';
  if (!isPublicMessageKind(kind)) {
    throw new ConvexError('Invalid public message kind.');
  }

  return {
    text: trimmed,
    kind,
    replyToEventId: params.replyToEventId ?? null,
  };
}

export type NormalizedWolfChatMessage = {
  text: string;
};

export function normalizeWolfChatMessageInput(params: { text: string }): NormalizedWolfChatMessage {
  const trimmed = params.text.trim();
  if (trimmed.length < WOLF_CHAT_MIN) {
    throw new ConvexError('Wolf chat message cannot be empty.');
  }
  if (trimmed.length > WOLF_CHAT_MAX) {
    throw new ConvexError(`Wolf chat message exceeds ${WOLF_CHAT_MAX} characters.`);
  }
  return { text: trimmed };
}

export type MatchSayPublicOutcome = {
  nextState: MatchState;
  event: WerewolfEvent;
  message: {
    playerId: PlayerId;
    kind: PublicMessageKind;
    text: string;
  };
};

export function applyMatchSayPublic(
  state: MatchState,
  params: {
    playerId: PlayerId;
    text: string;
    kind?: string;
    replyToEventId?: string | null;
    now: number;
  },
): MatchSayPublicOutcome {
  const normalized = normalizePublicMessageInput({
    text: params.text,
    kind: params.kind,
    replyToEventId: params.replyToEventId,
  });

  const player = findPlayer(state, params.playerId);
  if (
    player.lastPublicMessageAt !== undefined &&
    params.now - player.lastPublicMessageAt < PUBLIC_MESSAGE_COOLDOWN_MS
  ) {
    throw new Error('Public messages are limited to one every 3 seconds.');
  }

  const withAction = applyDayAction(state, {
    type: 'SAY_PUBLIC',
    playerId: params.playerId,
    text: normalized.text,
    kind: normalized.kind,
    replyToEventId: normalized.replyToEventId,
  });

  const nextState = updatePlayerState(withAction, params.playerId, (current) => ({
    ...current,
    lastPublicMessageAt: params.now,
  }));

  const event = createPublicMessageEvent({
    at: params.now,
    playerId: params.playerId,
    text: normalized.text,
    kind: normalized.kind,
    replyToEventId: normalized.replyToEventId,
  });

  return {
    nextState,
    event,
    message: {
      playerId: params.playerId,
      kind: normalized.kind,
      text: normalized.text,
    },
  };
}

export type MatchVoteOutcome = {
  nextState: MatchState;
  event: WerewolfEvent;
  vote: {
    voterPlayerId: PlayerId;
    targetPlayerId: PlayerId | null;
    reason: string | null;
  };
};

export type MatchWolfKillOutcome = {
  nextState: MatchState;
  event: WerewolfEvent;
  selection: {
    byPlayerId: PlayerId;
    targetPlayerId: PlayerId;
  };
};

export type MatchSeerInspectOutcome = {
  nextState: MatchState;
  event: WerewolfEvent;
  result: {
    targetPlayerId: PlayerId;
    alignment: 'WEREWOLF' | 'NOT_WEREWOLF';
  };
};

export type MatchDoctorProtectOutcome = {
  nextState: MatchState;
  event: WerewolfEvent;
  protection: {
    byPlayerId: PlayerId;
    targetPlayerId: PlayerId;
  };
};

export function normalizeVoteReason(reason?: string | null): string | null {
  if (reason === undefined || reason === null) {
    return null;
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > VOTE_REASON_MAX) {
    throw new ConvexError(`Vote reason exceeds ${VOTE_REASON_MAX} characters.`);
  }
  return trimmed;
}

export function applyMatchVote(
  state: MatchState,
  params: {
    voterPlayerId: PlayerId;
    targetPlayerId: PlayerId | null;
    reason?: string | null;
    now: number;
  },
): MatchVoteOutcome {
  const normalizedReason = normalizeVoteReason(params.reason);

  const nextState = applyDayAction(state, {
    type: 'CAST_VOTE',
    playerId: params.voterPlayerId,
    targetPlayerId: params.targetPlayerId,
    reason: normalizedReason,
  });

  const event = createVoteCastEvent({
    at: params.now,
    voterPlayerId: params.voterPlayerId,
    targetPlayerId: params.targetPlayerId,
    reason: normalizedReason,
  });

  return {
    nextState,
    event,
    vote: {
      voterPlayerId: params.voterPlayerId,
      targetPlayerId: params.targetPlayerId,
      reason: normalizedReason,
    },
  };
}

export function applyMatchWolfKill(
  state: MatchState,
  params: {
    playerId: PlayerId;
    targetPlayerId: PlayerId;
    now: number;
  },
): MatchWolfKillOutcome {
  const nextState = applyNightAction(state, {
    type: 'WOLF_KILL',
    playerId: params.playerId,
    targetPlayerId: params.targetPlayerId,
  });

  const target = findPlayer(nextState, params.targetPlayerId);
  const event = createNarratorEvent({
    at: params.now,
    visibility: 'WOLVES',
    text: `Wolves selected ${target.displayName} as their target.`,
  });

  return {
    nextState,
    event,
    selection: {
      byPlayerId: params.playerId,
      targetPlayerId: params.targetPlayerId,
    },
  };
}

export function applyMatchSeerInspect(
  state: MatchState,
  params: {
    playerId: PlayerId;
    targetPlayerId: PlayerId;
    now: number;
  },
): MatchSeerInspectOutcome {
  const nextState = applyNightAction(state, {
    type: 'SEER_INSPECT',
    playerId: params.playerId,
    targetPlayerId: params.targetPlayerId,
  });

  const target = findPlayer(nextState, params.targetPlayerId);
  const alignment = target.role === 'WEREWOLF' ? 'WEREWOLF' : 'NOT_WEREWOLF';

  const event = createNarratorEvent({
    at: params.now,
    visibility: { kind: 'PLAYER_PRIVATE', playerId: params.playerId },
    text: `Your vision reveals ${target.displayName} is ${alignment}.`,
  });

  return {
    nextState,
    event,
    result: {
      targetPlayerId: target.playerId,
      alignment,
    },
  };
}

export function applyMatchDoctorProtect(
  state: MatchState,
  params: {
    playerId: PlayerId;
    targetPlayerId: PlayerId;
    now: number;
  },
): MatchDoctorProtectOutcome {
  const nextState = applyNightAction(state, {
    type: 'DOCTOR_PROTECT',
    playerId: params.playerId,
    targetPlayerId: params.targetPlayerId,
  });

  const target = findPlayer(nextState, params.targetPlayerId);
  const event = createNarratorEvent({
    at: params.now,
    visibility: { kind: 'PLAYER_PRIVATE', playerId: params.playerId },
    text: `You will protect ${target.displayName} tonight.`,
  });

  return {
    nextState,
    event,
    protection: {
      byPlayerId: params.playerId,
      targetPlayerId: target.playerId,
    },
  };
}

export type MatchWolfChatOutcome = {
  nextState: MatchState;
  event: WerewolfEvent;
  message: {
    playerId: PlayerId;
    text: string;
  };
};

export function applyMatchWolfChat(
  state: MatchState,
  params: {
    playerId: PlayerId;
    text: string;
    now: number;
  },
): MatchWolfChatOutcome {
  if (state.phase !== 'NIGHT') {
    throw new Error('Wolf chat can only be handled during NIGHT');
  }

  const player = findPlayer(state, params.playerId);
  if (!player.alive) {
    throw new Error('Dead players cannot use wolf chat');
  }
  if (player.role !== 'WEREWOLF') {
    throw new Error('Only werewolves can use wolf chat');
  }

  const normalized = normalizeWolfChatMessageInput({ text: params.text });
  if (
    player.lastWolfChatAt !== undefined &&
    params.now - player.lastWolfChatAt < WOLF_CHAT_COOLDOWN_MS
  ) {
    throw new Error('Wolf chat is limited to one message every 2 seconds.');
  }
  const nextState = updatePlayerState(state, params.playerId, (current) => ({
    ...current,
    lastWolfChatAt: params.now,
  }));

  const event = createWolfChatMessageEvent({
    at: params.now,
    fromWolfId: params.playerId,
    text: normalized.text,
  });

  return {
    nextState,
    event,
    message: {
      playerId: params.playerId,
      text: normalized.text,
    },
  };
}

export const matchReady = mutation({
  args: {
    playerId,
    matchId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MatchReadyResult> => {
    validateIdempotencyKey(args.idempotencyKey);

    const now = Date.now();
    const { result } = await runWithIdempotency({
      store: createIdempotencyStore(ctx.db),
      scope: IDEMPOTENCY_SCOPES.matchReady,
      key: args.idempotencyKey,
      playerId: args.playerId,
      matchId: args.matchId,
      now,
      run: async () => {
        const snapshot = await loadMatchSnapshot(ctx.db, args.matchId as MatchId);
        const state = matchSnapshotToState(snapshot);
        const outcome = applyMatchReady(state, args.playerId as PlayerId, now);

        if (outcome.changed) {
          await writeMatchState(ctx.db, snapshot, outcome.nextState);
          if (outcome.event) {
            await appendMatchEvents(ctx.db, args.matchId as MatchId, [outcome.event]);
          }

          if (canAdvancePhaseEarly(outcome.nextState)) {
            await ctx.scheduler.runAfter(
              0,
              internalScheduler.werewolf.advancePhase.advancePhase,
              {
                matchId: args.matchId,
                expectedPhase: outcome.nextState.phase,
                expectedPhaseEndsAt: outcome.nextState.phaseEndsAt,
              },
            );
          }
        }

        return {
          matchId: args.matchId,
          playerId: args.playerId,
          ready: outcome.ready,
        };
      },
    });

    return result;
  },
});

export const matchSayPublic = mutation({
  args: {
    playerId,
    matchId: v.string(),
    text: v.string(),
    kind: v.optional(v.string()),
    replyToEventId: v.optional(v.union(v.string(), v.null())),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MatchSayPublicResult> => {
    validateIdempotencyKey(args.idempotencyKey);
    const now = Date.now();
    const { result } = await runWithIdempotency({
      store: createIdempotencyStore(ctx.db),
      scope: IDEMPOTENCY_SCOPES.matchSayPublic,
      key: args.idempotencyKey,
      playerId: args.playerId,
      matchId: args.matchId,
      now,
      run: async () => {
        const snapshot = await loadMatchSnapshot(ctx.db, args.matchId as MatchId);
        const state = matchSnapshotToState(snapshot);

        const outcome = applyMatchSayPublic(state, {
          playerId: args.playerId as PlayerId,
          text: args.text,
          kind: args.kind,
          replyToEventId: args.replyToEventId,
          now,
        });

        await writeMatchState(ctx.db, snapshot, outcome.nextState);
        const seqs = await appendMatchEvents(ctx.db, args.matchId as MatchId, [outcome.event]);
        if (seqs.length !== 1) {
          throw new Error('Expected a single public message event');
        }

        if (canAdvancePhaseEarly(outcome.nextState)) {
          await ctx.scheduler.runAfter(
            0,
            internalScheduler.werewolf.advancePhase.advancePhase,
            {
              matchId: args.matchId,
              expectedPhase: outcome.nextState.phase,
              expectedPhaseEndsAt: outcome.nextState.phaseEndsAt,
            },
          );
        }

        return {
          matchId: args.matchId,
          eventId: String(seqs[0]),
          message: {
            playerId: outcome.message.playerId,
            kind: outcome.message.kind,
            text: outcome.message.text,
          },
        };
      },
    });

    return result;
  },
});

export const matchVote = mutation({
  args: {
    playerId,
    matchId: v.string(),
    targetPlayerId: v.union(v.string(), v.null()),
    reason: v.optional(v.union(v.string(), v.null())),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MatchVoteResult> => {
    validateIdempotencyKey(args.idempotencyKey);

    const now = Date.now();
    const { result } = await runWithIdempotency({
      store: createIdempotencyStore(ctx.db),
      scope: IDEMPOTENCY_SCOPES.matchVote,
      key: args.idempotencyKey,
      playerId: args.playerId,
      matchId: args.matchId,
      now,
      run: async () => {
        const snapshot = await loadMatchSnapshot(ctx.db, args.matchId as MatchId);
        const state = matchSnapshotToState(snapshot);

        const outcome = applyMatchVote(state, {
          voterPlayerId: args.playerId as PlayerId,
          targetPlayerId: args.targetPlayerId as PlayerId | null,
          reason: args.reason,
          now,
        });

        await writeMatchState(ctx.db, snapshot, outcome.nextState);
        const seqs = await appendMatchEvents(ctx.db, args.matchId as MatchId, [outcome.event]);
        if (seqs.length !== 1) {
          throw new Error('Expected a single vote cast event');
        }

        if (canAdvancePhaseEarly(outcome.nextState)) {
          await ctx.scheduler.runAfter(
            0,
            internalScheduler.werewolf.advancePhase.advancePhase,
            {
              matchId: args.matchId,
              expectedPhase: outcome.nextState.phase,
              expectedPhaseEndsAt: outcome.nextState.phaseEndsAt,
            },
          );
        }

        return {
          matchId: args.matchId,
          eventId: String(seqs[0]),
          vote: {
            voterPlayerId: outcome.vote.voterPlayerId,
            targetPlayerId: outcome.vote.targetPlayerId,
          },
        };
      },
    });

    return result;
  },
});

export const matchWolfKill = mutation({
  args: {
    playerId,
    matchId: v.string(),
    targetPlayerId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MatchWolfKillResult> => {
    validateIdempotencyKey(args.idempotencyKey);

    const now = Date.now();
    const { result } = await runWithIdempotency({
      store: createIdempotencyStore(ctx.db),
      scope: IDEMPOTENCY_SCOPES.matchWolfKill,
      key: args.idempotencyKey,
      playerId: args.playerId,
      matchId: args.matchId,
      now,
      run: async () => {
        const snapshot = await loadMatchSnapshot(ctx.db, args.matchId as MatchId);
        const state = matchSnapshotToState(snapshot);

        const outcome = applyMatchWolfKill(state, {
          playerId: args.playerId as PlayerId,
          targetPlayerId: args.targetPlayerId as PlayerId,
          now,
        });

        await writeMatchState(ctx.db, snapshot, outcome.nextState);
        const seqs = await appendMatchEvents(ctx.db, args.matchId as MatchId, [outcome.event]);
        if (seqs.length !== 1) {
          throw new Error('Expected a single wolf kill selection event');
        }

        return {
          matchId: args.matchId,
          eventId: String(seqs[0]),
          selection: {
            byPlayerId: outcome.selection.byPlayerId,
            targetPlayerId: outcome.selection.targetPlayerId,
          },
        };
      },
    });

    return result;
  },
});

export const matchSeerInspect = mutation({
  args: {
    playerId,
    matchId: v.string(),
    targetPlayerId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MatchSeerInspectResult> => {
    validateIdempotencyKey(args.idempotencyKey);

    const now = Date.now();
    const { result } = await runWithIdempotency({
      store: createIdempotencyStore(ctx.db),
      scope: IDEMPOTENCY_SCOPES.matchSeerInspect,
      key: args.idempotencyKey,
      playerId: args.playerId,
      matchId: args.matchId,
      now,
      run: async () => {
        const snapshot = await loadMatchSnapshot(ctx.db, args.matchId as MatchId);
        const state = matchSnapshotToState(snapshot);

        const outcome = applyMatchSeerInspect(state, {
          playerId: args.playerId as PlayerId,
          targetPlayerId: args.targetPlayerId as PlayerId,
          now,
        });

        await writeMatchState(ctx.db, snapshot, outcome.nextState);
        const seqs = await appendMatchEvents(ctx.db, args.matchId as MatchId, [outcome.event]);
        if (seqs.length !== 1) {
          throw new Error('Expected a single seer inspect event');
        }

        return {
          matchId: args.matchId,
          eventId: String(seqs[0]),
          result: {
            targetPlayerId: outcome.result.targetPlayerId,
            alignment: outcome.result.alignment,
          },
        };
      },
    });

    return result;
  },
});

export const matchDoctorProtect = mutation({
  args: {
    playerId,
    matchId: v.string(),
    targetPlayerId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MatchDoctorProtectResult> => {
    validateIdempotencyKey(args.idempotencyKey);

    const now = Date.now();
    const { result } = await runWithIdempotency({
      store: createIdempotencyStore(ctx.db),
      scope: IDEMPOTENCY_SCOPES.matchDoctorProtect,
      key: args.idempotencyKey,
      playerId: args.playerId,
      matchId: args.matchId,
      now,
      run: async () => {
        const snapshot = await loadMatchSnapshot(ctx.db, args.matchId as MatchId);
        const state = matchSnapshotToState(snapshot);

        const outcome = applyMatchDoctorProtect(state, {
          playerId: args.playerId as PlayerId,
          targetPlayerId: args.targetPlayerId as PlayerId,
          now,
        });

        await writeMatchState(ctx.db, snapshot, outcome.nextState);
        const seqs = await appendMatchEvents(ctx.db, args.matchId as MatchId, [outcome.event]);
        if (seqs.length !== 1) {
          throw new Error('Expected a single doctor protect event');
        }

        return {
          matchId: args.matchId,
          eventId: String(seqs[0]),
          protection: {
            byPlayerId: outcome.protection.byPlayerId,
            targetPlayerId: outcome.protection.targetPlayerId,
          },
        };
      },
    });

    return result;
  },
});

export const matchWolfChat = mutation({
  args: {
    playerId,
    matchId: v.string(),
    text: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MatchWolfChatResult> => {
    validateIdempotencyKey(args.idempotencyKey);

    const now = Date.now();
    const { result } = await runWithIdempotency({
      store: createIdempotencyStore(ctx.db),
      scope: IDEMPOTENCY_SCOPES.matchWolfChat,
      key: args.idempotencyKey,
      playerId: args.playerId,
      matchId: args.matchId,
      now,
      run: async () => {
        const snapshot = await loadMatchSnapshot(ctx.db, args.matchId as MatchId);
        const state = matchSnapshotToState(snapshot);

        const outcome = applyMatchWolfChat(state, {
          playerId: args.playerId as PlayerId,
          text: args.text,
          now,
        });

        await writeMatchState(ctx.db, snapshot, outcome.nextState);
        const seqs = await appendMatchEvents(ctx.db, args.matchId as MatchId, [outcome.event]);
        if (seqs.length !== 1) {
          throw new Error('Expected a single wolf chat event');
        }

        return {
          matchId: args.matchId,
          eventId: String(seqs[0]),
          message: {
            playerId: outcome.message.playerId,
            text: outcome.message.text,
          },
        };
      },
    });

    return result;
  },
});

function updatePlayerState(
  state: MatchState,
  targetPlayerId: PlayerId,
  update: (player: MatchPlayerState) => MatchPlayerState,
): MatchState {
  let updated = false;
  const nextPlayers = state.players.map((player) => {
    if (player.playerId !== targetPlayerId) {
      return player;
    }
    updated = true;
    return update(player);
  });
  if (!updated) {
    throw new Error(`Unknown player ${targetPlayerId}`);
  }
  return {
    ...state,
    players: nextPlayers,
  };
}

function findPlayer(state: MatchState, targetPlayerId: PlayerId): MatchPlayerState {
  const player = state.players.find((entry) => entry.playerId === targetPlayerId);
  if (!player) {
    throw new Error(`Unknown player ${targetPlayerId}`);
  }
  return player;
}
