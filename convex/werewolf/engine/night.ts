import { xxHash32 } from '../../util/xxhash';
import type { PlayerId, WerewolfCommand } from '../types';
import type { MatchPlayerState, MatchState, SeerInspection } from './state';

export type NightActionCommand = Extract<
  WerewolfCommand,
  { type: 'WOLF_KILL' | 'SEER_INSPECT' | 'DOCTOR_PROTECT' }
>;

export type NightResolution = {
  nextState: MatchState;
  wolfKillTargetPlayerId?: PlayerId;
  protectedPlayerId?: PlayerId;
  eliminatedPlayerId?: PlayerId;
  timeoutEliminatedPlayerIds: PlayerId[];
  seerResult?: SeerInspection;
};

const DEFAULT_WOLF_KILL_SEED = 0x6d2b79f5;
const MAX_MISSED_RESPONSES = 4;

export function applyNightAction(state: MatchState, command: NightActionCommand): MatchState {
  assertNightPhase(state, 'Night actions');

  const actor = findPlayer(state, command.playerId);
  if (!actor.alive) {
    throw new Error('Dead players cannot act at night');
  }

  switch (command.type) {
    case 'WOLF_KILL': {
      if (actor.role !== 'WEREWOLF') {
        throw new Error('Only werewolves can submit a wolf kill');
      }

      const target = findPlayer(state, command.targetPlayerId);
      if (!target.alive) {
        throw new Error('Wolf kill target must be alive');
      }
      if (target.role === 'WEREWOLF') {
        throw new Error('Wolf kill target must be a non-werewolf');
      }

      const nextPlayers = state.players.map((player) => {
        if (player.playerId !== actor.playerId) {
          return player;
        }
        return {
          ...player,
          nightAction: {
            ...player.nightAction,
            wolfKillTargetPlayerId: target.playerId,
          },
        };
      });

      return { ...state, players: nextPlayers };
    }
    case 'SEER_INSPECT': {
      if (actor.role !== 'SEER') {
        throw new Error('Only the seer can inspect at night');
      }

      const target = findPlayer(state, command.targetPlayerId);
      if (!target.alive) {
        throw new Error('Seer inspection target must be alive');
      }
      if (target.playerId === actor.playerId) {
        throw new Error('Seer cannot inspect themselves');
      }

      const nextPlayers = state.players.map((player) => {
        if (player.playerId !== actor.playerId) {
          return player;
        }
        return {
          ...player,
          nightAction: {
            ...player.nightAction,
            seerInspectTargetPlayerId: target.playerId,
          },
        };
      });

      return { ...state, players: nextPlayers };
    }
    case 'DOCTOR_PROTECT': {
      if (actor.role !== 'DOCTOR') {
        throw new Error('Only the doctor can protect at night');
      }

      const target = findPlayer(state, command.targetPlayerId);
      if (!target.alive) {
        throw new Error('Doctor protection target must be alive');
      }
      if (actor.doctorLastProtectedPlayerId === target.playerId) {
        throw new Error('Doctor cannot protect the same target on consecutive nights');
      }

      const nextPlayers = state.players.map((player) => {
        if (player.playerId !== actor.playerId) {
          return player;
        }
        return {
          ...player,
          nightAction: {
            ...player.nightAction,
            doctorProtectTargetPlayerId: target.playerId,
          },
        };
      });

      return { ...state, players: nextPlayers };
    }
    default: {
      const _exhaustive: never = command;
      return state;
    }
  }
}

export function resolveNight(state: MatchState, now: number): NightResolution {
  assertNightPhase(state, 'Night resolution');

  const alivePlayers = state.players.filter((player) => player.alive);
  const aliveById = new Map(alivePlayers.map((player) => [player.playerId, player]));

  const wolfKillTargetPlayerId = selectWolfKillTarget(state, alivePlayers, aliveById);

  const doctor = alivePlayers.find((player) => player.role === 'DOCTOR');
  const protectedPlayerId = doctor?.nightAction.doctorProtectTargetPlayerId;
  if (protectedPlayerId && !aliveById.has(protectedPlayerId)) {
    throw new Error(`Doctor protection target ${protectedPlayerId} is not alive`);
  }

  const seer = alivePlayers.find((player) => player.role === 'SEER');
  const seerTargetPlayerId = seer?.nightAction.seerInspectTargetPlayerId;
  let seerResult: SeerInspection | undefined;
  if (seer && seerTargetPlayerId) {
    const target = aliveById.get(seerTargetPlayerId) ?? findPlayer(state, seerTargetPlayerId);
    seerResult = {
      night: state.nightNumber,
      targetPlayerId: target.playerId,
      result: target.role === 'WEREWOLF' ? 'WEREWOLF' : 'NOT_WEREWOLF',
    };
  }

  const eliminatedPlayerId =
    wolfKillTargetPlayerId && wolfKillTargetPlayerId !== protectedPlayerId
      ? wolfKillTargetPlayerId
      : undefined;

  const timeoutEliminatedPlayerIds = alivePlayers
    .filter((player) => player.missedResponses >= MAX_MISSED_RESPONSES)
    .map((player) => player.playerId)
    .filter((playerId) => playerId !== eliminatedPlayerId);

  const eliminatedSet = new Set<PlayerId>([
    ...(eliminatedPlayerId ? [eliminatedPlayerId] : []),
    ...timeoutEliminatedPlayerIds,
  ]);

  const nextPlayers = state.players.map((player) => {
    const next: MatchPlayerState = { ...player, nightAction: {} };

    if (eliminatedSet.has(player.playerId)) {
      next.alive = false;
      next.eliminatedAt = now;
      next.revealedRole = true;
    }

    if (player.role === 'DOCTOR' && protectedPlayerId) {
      next.doctorLastProtectedPlayerId = protectedPlayerId;
    }

    if (player.role === 'SEER' && seerResult) {
      next.seerHistory = [...player.seerHistory, seerResult];
    }

    return next;
  });

  const playersAlive = nextPlayers.filter((player) => player.alive).length;

  return {
    nextState: { ...state, players: nextPlayers, playersAlive },
    wolfKillTargetPlayerId,
    protectedPlayerId,
    eliminatedPlayerId,
    timeoutEliminatedPlayerIds,
    seerResult,
  };
}

function assertNightPhase(state: MatchState, action: string): void {
  if (state.phase !== 'NIGHT') {
    throw new Error(`${action} can only be handled during NIGHT`);
  }
}

function findPlayer(state: MatchState, playerId: PlayerId): MatchPlayerState {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) {
    throw new Error(`Unknown player ${playerId}`);
  }
  return player;
}

function selectWolfKillTarget(
  state: MatchState,
  alivePlayers: MatchPlayerState[],
  aliveById: Map<PlayerId, MatchPlayerState>,
): PlayerId | undefined {
  const aliveWolves = alivePlayers.filter((player) => player.role === 'WEREWOLF');
  if (aliveWolves.length === 0) {
    return undefined;
  }

  const aliveNonWolves = alivePlayers.filter((player) => player.role !== 'WEREWOLF');
  if (aliveNonWolves.length === 0) {
    return undefined;
  }

  const seedBase = `${state.startedAt}:${state.nightNumber}`;
  const wolfTargets = aliveWolves
    .map((player) => player.nightAction.wolfKillTargetPlayerId)
    .filter((target): target is PlayerId => typeof target === 'string');

  if (wolfTargets.length > 0) {
    const voteCounts = new Map<PlayerId, number>();
    for (const targetId of wolfTargets) {
      voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
    }
    const highestVoteCount = Math.max(...voteCounts.values());
    const topTargets = Array.from(voteCounts.entries())
      .filter(([, count]) => count === highestVoteCount)
      .map(([targetId]) => targetId);
    const targetId = selectRandomTarget(seedBase, topTargets, 'wolf-vote');
    const target = aliveById.get(targetId);
    if (!target || target.role === 'WEREWOLF') {
      throw new Error(`Wolf kill target ${targetId} is not eligible`);
    }
    return targetId;
  }

  return selectRandomTarget(
    seedBase,
    aliveNonWolves.map((player) => player.playerId),
    'wolf-default',
  );
}

function selectRandomTarget(seedBase: string, candidates: PlayerId[], label: string): PlayerId {
  if (candidates.length === 0) {
    throw new Error('No eligible wolf kill targets available');
  }
  const uniqueTargets = Array.from(new Set(candidates));
  uniqueTargets.sort();
  const seed = `${seedBase}:${label}:${uniqueTargets.join(',')}`;
  const hash = xxHash32(seed, DEFAULT_WOLF_KILL_SEED) >>> 0;
  const index = hash % uniqueTargets.length;
  return uniqueTargets[index];
}
