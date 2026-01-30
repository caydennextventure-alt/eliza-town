import { anyApi } from 'convex/server';
import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { appendMatchEvents, loadMatchSnapshot, matchSnapshotToState, writeMatchState } from './db';
import {
  createGameEndedEvent,
  createNightResultEvent,
  createPhaseChangedEvent,
  createPlayerEliminatedEvent,
} from './engine/events';
import type { WerewolfEvent } from './engine/events';
import { resolveDayVote } from './engine/day';
import { buildNarratorUpdate } from './engine/narrator';
import { resolveNight } from './engine/night';
import { canAdvancePhaseEarly } from './engine/earlyAdvance';
import type { MatchState, WinningTeam } from './engine/state';
import { advancePhase as advancePhaseEngine } from './engine/transitions';
import { evaluateWinCondition } from './engine/win';
import { getRoundCount, getRoundStartAt } from './rounds';
import type { MatchId, PlayerId, Role } from './types';

const parseEnvMs = (value?: string): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const rounded = Math.round(parsed);
  if (rounded <= 0) {
    return null;
  }
  return rounded;
};

const getE2EMatchMaxDurationMs = (): number | null => {
  const explicit = parseEnvMs(process.env.WEREWOLF_E2E_MAX_DURATION_MS);
  if (explicit !== null) {
    return explicit;
  }
  const isE2EFast = /^(1|true|yes)$/i.test(process.env.WEREWOLF_E2E_FAST ?? '');
  if (!isE2EFast) {
    return null;
  }
  return 180_000;
};

const pickForcedWinner = (state: MatchState): WinningTeam => {
  const alivePlayers = state.players.filter((player) => player.alive);
  const aliveWolves = alivePlayers.filter((player) => player.role === 'WEREWOLF').length;
  const aliveVillagers = alivePlayers.length - aliveWolves;
  return aliveWolves >= aliveVillagers ? 'WEREWOLVES' : 'VILLAGERS';
};

const internalScheduler = anyApi;

const phaseValidator = v.union(
  v.literal('LOBBY'),
  v.literal('NIGHT'),
  v.literal('DAY_ANNOUNCE'),
  v.literal('DAY_OPENING'),
  v.literal('DAY_DISCUSSION'),
  v.literal('DAY_VOTE'),
  v.literal('DAY_RESOLUTION'),
  v.literal('ENDED'),
);

export type AdvanceMatchPhaseResult = {
  nextState: MatchState;
  events: WerewolfEvent[];
  advanced: boolean;
};

export function advanceMatchPhase(state: MatchState, now: number): AdvanceMatchPhaseResult {
  if (state.phase === 'ENDED') {
    return { nextState: state, events: [], advanced: false };
  }
  if (!shouldAdvancePhase(state, now)) {
    return { nextState: state, events: [], advanced: false };
  }

  const maxDurationMs = getE2EMatchMaxDurationMs();
  const maxDurationReached = maxDurationMs !== null && now - state.startedAt >= maxDurationMs;

  let workingState = state;
  let eliminatedPlayerId: PlayerId | undefined;
  let wolfKillTargetPlayerId: PlayerId | undefined;
  let timeoutEliminatedPlayerIds: PlayerId[] = [];

  if (state.phase === 'NIGHT') {
    const resolution = resolveNight(state, now);
    workingState = resolution.nextState;
    eliminatedPlayerId = resolution.eliminatedPlayerId;
    wolfKillTargetPlayerId = resolution.wolfKillTargetPlayerId;
    timeoutEliminatedPlayerIds = resolution.timeoutEliminatedPlayerIds;
  } else if (state.phase === 'DAY_VOTE') {
    const resolution = resolveDayVote(state, now);
    workingState = resolution.nextState;
    eliminatedPlayerId = resolution.eliminatedPlayerId;
  }

  const winner = evaluateWinCondition(workingState);
  const forcedWinner = !winner && maxDurationReached;
  const resolvedWinner = winner ?? (forcedWinner ? pickForcedWinner(workingState) : undefined);
  if (resolvedWinner) {
    workingState = { ...workingState, winner: resolvedWinner };
  }

  const allowEarly = now < state.phaseEndsAt;
  let nextState = advancePhaseEngine(workingState, now, { allowEarly });
  if (state.phase === 'NIGHT' && resolvedWinner) {
    nextState = forceEndState(nextState, now);
  }
  if (forcedWinner) {
    nextState = forceEndState(nextState, now);
  }

  if (nextState.phase === state.phase) {
    return { nextState, events: [], advanced: false };
  }

  const narratorUpdate = buildNarratorUpdate({
    from: state,
    to: nextState,
    now,
    eliminatedPlayerId,
    wolfKillTargetPlayerId,
    timeoutEliminatedPlayerIds,
  });

  const updatedState = {
    ...nextState,
    publicSummary: narratorUpdate.publicSummary,
  };

  const events = buildAdvanceEvents({
    from: state,
    to: updatedState,
    now,
    eliminatedPlayerId,
    wolfKillTargetPlayerId,
    timeoutEliminatedPlayerIds,
  }).concat(narratorUpdate.events);

  return { nextState: updatedState, events, advanced: true };
}

type AdvanceEventParams = {
  from: MatchState;
  to: MatchState;
  now: number;
  eliminatedPlayerId?: PlayerId;
  wolfKillTargetPlayerId?: PlayerId;
  timeoutEliminatedPlayerIds?: PlayerId[];
};

function buildAdvanceEvents(params: AdvanceEventParams): WerewolfEvent[] {
  const events: WerewolfEvent[] = [];
  if (params.from.phase === params.to.phase) {
    return events;
  }

  events.push(
    createPhaseChangedEvent({
      at: params.now,
      from: params.from.phase,
      to: params.to.phase,
      dayNumber: params.to.dayNumber,
      phaseEndsAt: params.to.phaseEndsAt,
    }),
  );

  if (params.from.phase === 'NIGHT') {
    events.push(
      createNightResultEvent({
        at: params.now,
        wolfKillTargetPlayerId: params.wolfKillTargetPlayerId,
        eliminatedPlayerId: params.eliminatedPlayerId,
      }),
    );
    const eliminatedIds = new Set<PlayerId>();
    if (params.eliminatedPlayerId) {
      eliminatedIds.add(params.eliminatedPlayerId);
    }
    for (const playerId of params.timeoutEliminatedPlayerIds ?? []) {
      eliminatedIds.add(playerId);
    }
    for (const playerId of eliminatedIds) {
      events.push(
        createPlayerEliminatedEvent({
          at: params.now,
          playerId,
          roleRevealed: findRole(params.to, playerId),
        }),
      );
    }
  }

  if (params.from.phase === 'DAY_VOTE' && params.eliminatedPlayerId) {
    events.push(
      createPlayerEliminatedEvent({
        at: params.now,
        playerId: params.eliminatedPlayerId,
        roleRevealed: findRole(params.to, params.eliminatedPlayerId),
      }),
    );
  }

  if (params.to.phase === 'ENDED' && params.to.winner) {
    events.push(
      createGameEndedEvent({
        at: params.now,
        winningTeam: params.to.winner,
      }),
    );
  }

  return events;
}

function findRole(state: MatchState, playerId: PlayerId): Role {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) {
    throw new Error(`Missing player ${playerId}`);
  }
  return player.role;
}

function forceEndState(state: MatchState, now: number): MatchState {
  if (state.phase === 'ENDED') {
    return state;
  }
  return {
    ...state,
    phase: 'ENDED',
    phaseStartedAt: now,
    phaseEndsAt: now,
    endedAt: state.endedAt ?? now,
  };
}

export const advancePhase = internalMutation({
  args: {
    matchId: v.string(),
    expectedPhase: phaseValidator,
    expectedPhaseEndsAt: v.number(),
  },
  handler: async (ctx, args) => {
    const snapshot = await loadMatchSnapshot(ctx.db, args.matchId as MatchId);
    if (
      snapshot.match.phase !== args.expectedPhase ||
      snapshot.match.phaseEndsAt !== args.expectedPhaseEndsAt
    ) {
      return { advanced: false };
    }

    const state = matchSnapshotToState(snapshot);
    const now = Date.now();
    if (!shouldAdvancePhase(state, now)) {
      return { advanced: false };
    }

    const result = advanceMatchPhase(state, now);
    if (!result.advanced) {
      return { advanced: false };
    }

    await writeMatchState(ctx.db, snapshot, result.nextState);
    await appendMatchEvents(ctx.db, args.matchId as MatchId, result.events);
    await ctx.db.patch(snapshot.match._id, { lastAdvanceJobAt: now });

    if (result.nextState.phase !== 'ENDED') {
      const delayMs = Math.max(0, result.nextState.phaseEndsAt - now);
      await ctx.scheduler.runAfter(delayMs, internalScheduler.werewolf.advancePhase.advancePhase, {
        matchId: snapshot.match._id as string,
        expectedPhase: result.nextState.phase,
        expectedPhaseEndsAt: result.nextState.phaseEndsAt,
        });
    }

    const roundCount = getRoundCount(result.nextState.phase);
    if (roundCount > 0) {
      for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
        const roundStartAt = getRoundStartAt(result.nextState.phaseStartedAt, roundIndex);
        const delayMs = Math.max(0, roundStartAt - now);
        await ctx.scheduler.runAfter(delayMs, internalScheduler.werewolf.runner.runRound, {
          matchId: snapshot.match._id as string,
          phase: result.nextState.phase,
          phaseStartedAt: result.nextState.phaseStartedAt,
          roundIndex,
          scheduledAt: roundStartAt,
        });
      }
    }

    return { advanced: true };
  },
});

function shouldAdvancePhase(state: MatchState, now: number): boolean {
  return now >= state.phaseEndsAt || canAdvancePhaseEarly(state);
}
