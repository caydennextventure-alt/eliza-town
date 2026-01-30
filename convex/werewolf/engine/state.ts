import type { Phase, PlayerId, RequiredAction, Role } from '../types';
import { getRoundCount, getRoundDurationMs } from '../rounds';
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
  missedResponses: number;
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

const parseEnvMs = (value?: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const rounded = Math.round(parsed);
  if (rounded < 0) {
    return undefined;
  }
  return rounded;
};

const isE2EFast = () => /^(1|true|yes)$/i.test(process.env.WEREWOLF_E2E_FAST ?? '');

const getPhaseFallbackMs = (phase: Phase): number => {
  const fast = isE2EFast();
  switch (phase) {
    case 'LOBBY':
      return fast ? 2_000 : 10_000;
    case 'NIGHT':
      return fast ? 6_000 : 60_000;
    case 'DAY_ANNOUNCE':
      return fast ? 2_000 : 10_000;
    case 'DAY_OPENING':
      return fast ? 3_000 : 15_000;
    case 'DAY_DISCUSSION':
      return fast ? 6_000 : 45_000;
    case 'DAY_VOTE':
      return fast ? 3_000 : 15_000;
    case 'DAY_RESOLUTION':
      return fast ? 2_000 : 10_000;
    case 'ENDED':
      return 0;
    default: {
      const unreachable: never = phase;
      throw new Error(`Unknown phase ${unreachable}`);
    }
  }
};

const readPhaseDurationMs = (phase: Phase, fallback: number): number => {
  const raw = process.env[`WEREWOLF_PHASE_MS_${phase}`];
  const parsed = parseEnvMs(raw);
  if (parsed !== undefined) {
    return parsed;
  }
  const roundCount = getRoundCount(phase);
  if (roundCount > 0) {
    return roundCount * getRoundDurationMs();
  }
  return fallback;
};

export const getPhaseDurationMs = (phase: Phase): number => {
  switch (phase) {
    case 'LOBBY':
      return readPhaseDurationMs('LOBBY', getPhaseFallbackMs('LOBBY'));
    case 'NIGHT':
      return readPhaseDurationMs('NIGHT', getPhaseFallbackMs('NIGHT'));
    case 'DAY_ANNOUNCE':
      return readPhaseDurationMs('DAY_ANNOUNCE', getPhaseFallbackMs('DAY_ANNOUNCE'));
    case 'DAY_OPENING':
      return readPhaseDurationMs('DAY_OPENING', getPhaseFallbackMs('DAY_OPENING'));
    case 'DAY_DISCUSSION':
      return readPhaseDurationMs('DAY_DISCUSSION', getPhaseFallbackMs('DAY_DISCUSSION'));
    case 'DAY_VOTE':
      return readPhaseDurationMs('DAY_VOTE', getPhaseFallbackMs('DAY_VOTE'));
    case 'DAY_RESOLUTION':
      return readPhaseDurationMs('DAY_RESOLUTION', getPhaseFallbackMs('DAY_RESOLUTION'));
    case 'ENDED':
      return readPhaseDurationMs('ENDED', getPhaseFallbackMs('ENDED'));
    default: {
      const unreachable: never = phase;
      throw new Error(`Unknown phase ${unreachable}`);
    }
  }
};

export const getPhaseDurationsMs = (): Record<Phase, number> => ({
  LOBBY: getPhaseDurationMs('LOBBY'),
  NIGHT: getPhaseDurationMs('NIGHT'),
  DAY_ANNOUNCE: getPhaseDurationMs('DAY_ANNOUNCE'),
  DAY_OPENING: getPhaseDurationMs('DAY_OPENING'),
  DAY_DISCUSSION: getPhaseDurationMs('DAY_DISCUSSION'),
  DAY_VOTE: getPhaseDurationMs('DAY_VOTE'),
  DAY_RESOLUTION: getPhaseDurationMs('DAY_RESOLUTION'),
  ENDED: getPhaseDurationMs('ENDED'),
});

const INITIAL_PUBLIC_SUMMARY = 'Match created. Waiting in lobby.';

export function createInitialMatchState(
  players: MatchPlayerSeed[],
  now: number,
  roleSeed?: string | number,
): MatchState {
  const roleAssignments = assignRoles(
    players.map((player) => player.playerId),
    roleSeed,
  );
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
      missedResponses: 0,
      seerHistory: [],
      nightAction: {},
    };
  });

  return {
    phase: 'LOBBY',
    dayNumber: 0,
    nightNumber: 1,
    phaseStartedAt: now,
    phaseEndsAt: now + getPhaseDurationMs('LOBBY'),
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
