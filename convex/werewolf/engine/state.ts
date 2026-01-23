import type { Phase, PlayerId, RequiredAction, Role } from '../types';
import { assignRoles } from './roleAssign';

export type WinningTeam = 'VILLAGERS' | 'WEREWOLVES';

export type SeerInspection = {
  night: number;
  targetPlayerId: PlayerId;
  result: 'WEREWOLF' | 'NOT_WEREWOLF';
};

export type NightActionState = {
  wolfKillTargetPlayerId?: PlayerId;
  seerInspectTargetPlayerId?: PlayerId;
  doctorProtectTargetPlayerId?: PlayerId;
};

export type MatchPlayerState = {
  playerId: PlayerId;
  displayName: string;
  seat: number;
  role: Role;
  alive: boolean;
  ready: boolean;
  eliminatedAt?: number;
  revealedRole?: boolean;
  doctorLastProtectedPlayerId?: PlayerId;
  seerHistory: SeerInspection[];
  didOpeningForDay?: number;
  voteTargetPlayerId?: PlayerId | null;
  lastPublicMessageAt?: number;
  lastWolfChatAt?: number;
  nightAction: NightActionState;
};

export type MatchPlayerSeed = {
  playerId: PlayerId;
  displayName: string;
};

export type MatchState = {
  phase: Phase;
  dayNumber: number;
  nightNumber: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  startedAt: number;
  endedAt?: number;
  winner?: WinningTeam;
  publicSummary: string;
  players: MatchPlayerState[];
  playersAlive: number;
};

export const PHASE_DURATIONS_MS: Record<Phase, number> = {
  LOBBY: 30_000,
  NIGHT: 45_000,
  DAY_ANNOUNCE: 10_000,
  DAY_OPENING: 120_000,
  DAY_DISCUSSION: 90_000,
  DAY_VOTE: 45_000,
  DAY_RESOLUTION: 10_000,
  ENDED: 0,
};

const INITIAL_PUBLIC_SUMMARY = 'Match created. Waiting in lobby.';

export function createInitialMatchState(players: MatchPlayerSeed[], now: number): MatchState {
  const roleAssignments = assignRoles(players.map((player) => player.playerId));
  const rolesByPlayerId = new Map<PlayerId, Role>(
    roleAssignments.map((assignment) => [assignment.playerId, assignment.role]),
  );

  const playerStates: MatchPlayerState[] = players.map((player, index) => {
    const role = rolesByPlayerId.get(player.playerId);
    if (!role) {
      throw new Error(`Missing role assignment for player ${player.playerId}`);
    }
    return {
      playerId: player.playerId,
      displayName: player.displayName,
      seat: index + 1,
      role,
      alive: true,
      ready: false,
      seerHistory: [],
      nightAction: {},
    };
  });

  return {
    phase: 'LOBBY',
    dayNumber: 0,
    nightNumber: 1,
    phaseStartedAt: now,
    phaseEndsAt: now + PHASE_DURATIONS_MS.LOBBY,
    startedAt: now,
    publicSummary: INITIAL_PUBLIC_SUMMARY,
    players: playerStates,
    playersAlive: playerStates.length,
  };
}

export function computeRequiredAction(state: MatchState, playerId: PlayerId): RequiredAction {
  const player = findPlayer(state, playerId);
  if (!player.alive) {
    return requiredActionNone();
  }

  switch (state.phase) {
    case 'NIGHT':
      return computeNightRequiredAction(state, player);
    case 'DAY_OPENING':
      return {
        type: 'SPEAK_OPENING',
        allowedTargets: [],
        alreadySubmitted: player.didOpeningForDay === state.dayNumber,
      };
    case 'DAY_DISCUSSION':
      return {
        type: 'SPEAK_DISCUSSION',
        allowedTargets: [],
        alreadySubmitted: false,
      };
    case 'DAY_VOTE':
      return {
        type: 'VOTE',
        allowedTargets: alivePlayers(state).map((entry) => entry.playerId),
        alreadySubmitted: player.voteTargetPlayerId !== undefined,
      };
    default:
      return requiredActionNone();
  }
}

function computeNightRequiredAction(state: MatchState, player: MatchPlayerState): RequiredAction {
  const aliveInSeatOrder = alivePlayers(state);

  switch (player.role) {
    case 'WEREWOLF':
      return {
        type: 'WOLF_KILL',
        allowedTargets: aliveInSeatOrder
          .filter((entry) => entry.role !== 'WEREWOLF')
          .map((entry) => entry.playerId),
        alreadySubmitted: player.nightAction.wolfKillTargetPlayerId !== undefined,
      };
    case 'SEER':
      return {
        type: 'SEER_INSPECT',
        allowedTargets: aliveInSeatOrder
          .filter((entry) => entry.playerId !== player.playerId)
          .map((entry) => entry.playerId),
        alreadySubmitted: player.nightAction.seerInspectTargetPlayerId !== undefined,
      };
    case 'DOCTOR':
      return {
        type: 'DOCTOR_PROTECT',
        allowedTargets: aliveInSeatOrder
          .filter((entry) => entry.playerId !== player.doctorLastProtectedPlayerId)
          .map((entry) => entry.playerId),
        alreadySubmitted: player.nightAction.doctorProtectTargetPlayerId !== undefined,
      };
    default:
      return requiredActionNone();
  }
}

function requiredActionNone(): RequiredAction {
  return { type: 'NONE', allowedTargets: [], alreadySubmitted: true };
}

function alivePlayers(state: MatchState): MatchPlayerState[] {
  return state.players.filter((player) => player.alive);
}

function findPlayer(state: MatchState, playerId: PlayerId): MatchPlayerState {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) {
    throw new Error(`Unknown player ${playerId}`);
  }
  return player;
}
