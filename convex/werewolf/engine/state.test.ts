import type { Role } from '../types';
import { computeRequiredAction, createInitialMatchState } from './state';

const playerSeeds = Array.from({ length: 8 }, (_, index) => ({
  playerId: `p:${index + 1}`,
  displayName: `Player ${index + 1}`,
}));

const now = 1_700_000_000_000;

function getPlayerByRole(role: Role) {
  const state = createInitialMatchState(playerSeeds, now);
  const player = state.players.find((entry) => entry.role === role);
  if (!player) {
    throw new Error(`Missing player for role ${role}`);
  }
  return { state, player };
}

function findPlayer(state: ReturnType<typeof createInitialMatchState>, role: Role) {
  const player = state.players.find((entry) => entry.role === role);
  if (!player) {
    throw new Error(`Missing player for role ${role}`);
  }
  return player;
}

describe('computeRequiredAction', () => {
  it('returns NONE in non-action phases', () => {
    const phases = ['LOBBY', 'DAY_ANNOUNCE', 'DAY_RESOLUTION', 'ENDED'] as const;

    for (const phase of phases) {
      const state = createInitialMatchState(playerSeeds, now);
      state.phase = phase;

      const roles: Role[] = ['WEREWOLF', 'SEER', 'DOCTOR', 'VILLAGER'];
      for (const role of roles) {
        const player = findPlayer(state, role);
        expect(computeRequiredAction(state, player.playerId)).toEqual({
          type: 'NONE',
          allowedTargets: [],
          alreadySubmitted: true,
        });
      }
    }
  });

  it('returns night actions by role with correct targets', () => {
    const state = createInitialMatchState(playerSeeds, now);
    state.phase = 'NIGHT';

    const wolf = findPlayer(state, 'WEREWOLF');
    const seer = findPlayer(state, 'SEER');
    const doctor = findPlayer(state, 'DOCTOR');
    const villager = findPlayer(state, 'VILLAGER');

    const alivePlayers = state.players.filter((entry) => entry.alive);

    expect(computeRequiredAction(state, wolf.playerId)).toEqual({
      type: 'WOLF_KILL',
      allowedTargets: alivePlayers
        .filter((entry) => entry.role !== 'WEREWOLF')
        .map((entry) => entry.playerId),
      alreadySubmitted: false,
    });

    expect(computeRequiredAction(state, seer.playerId)).toEqual({
      type: 'SEER_INSPECT',
      allowedTargets: alivePlayers
        .filter((entry) => entry.playerId !== seer.playerId)
        .map((entry) => entry.playerId),
      alreadySubmitted: false,
    });

    expect(computeRequiredAction(state, doctor.playerId)).toEqual({
      type: 'DOCTOR_PROTECT',
      allowedTargets: alivePlayers.map((entry) => entry.playerId),
      alreadySubmitted: false,
    });

    expect(computeRequiredAction(state, villager.playerId)).toEqual({
      type: 'NONE',
      allowedTargets: [],
      alreadySubmitted: true,
    });
  });

  it('excludes the last protected player for the doctor', () => {
    const state = createInitialMatchState(playerSeeds, now);
    state.phase = 'NIGHT';

    const doctor = findPlayer(state, 'DOCTOR');
    const protectedTarget = state.players.find((entry) => entry.playerId !== doctor.playerId);
    if (!protectedTarget) {
      throw new Error('Missing doctor protection target');
    }
    doctor.doctorLastProtectedPlayerId = protectedTarget.playerId;

    const required = computeRequiredAction(state, doctor.playerId);
    expect(required.type).toBe('DOCTOR_PROTECT');
    expect(required.allowedTargets).not.toContain(protectedTarget.playerId);
  });

  it('marks night actions as already submitted when present', () => {
    const { state, player } = getPlayerByRole('WEREWOLF');
    state.phase = 'NIGHT';

    const target = state.players.find((entry) => entry.role !== 'WEREWOLF');
    if (!target) {
      throw new Error('Missing wolf target');
    }
    player.nightAction.wolfKillTargetPlayerId = target.playerId;

    const required = computeRequiredAction(state, player.playerId);
    expect(required.type).toBe('WOLF_KILL');
    expect(required.alreadySubmitted).toBe(true);
  });

  it('returns opening action and tracks submission', () => {
    const state = createInitialMatchState(playerSeeds, now);
    state.phase = 'DAY_OPENING';
    state.dayNumber = 2;

    const villager = findPlayer(state, 'VILLAGER');
    const first = computeRequiredAction(state, villager.playerId);
    expect(first.type).toBe('SPEAK_OPENING');
    expect(first.alreadySubmitted).toBe(false);

    villager.didOpeningForDay = state.dayNumber;
    const second = computeRequiredAction(state, villager.playerId);
    expect(second.type).toBe('SPEAK_OPENING');
    expect(second.alreadySubmitted).toBe(true);
  });

  it('returns discussion action during DAY_DISCUSSION', () => {
    const state = createInitialMatchState(playerSeeds, now);
    state.phase = 'DAY_DISCUSSION';

    const seer = findPlayer(state, 'SEER');
    expect(computeRequiredAction(state, seer.playerId)).toEqual({
      type: 'SPEAK_DISCUSSION',
      allowedTargets: [],
      alreadySubmitted: false,
    });
  });

  it('returns vote action and tracks submission', () => {
    const state = createInitialMatchState(playerSeeds, now);
    state.phase = 'DAY_VOTE';

    const doctor = findPlayer(state, 'DOCTOR');
    const expectedTargets = state.players.filter((entry) => entry.alive).map((entry) => entry.playerId);

    const first = computeRequiredAction(state, doctor.playerId);
    expect(first).toEqual({
      type: 'VOTE',
      allowedTargets: expectedTargets,
      alreadySubmitted: false,
    });

    doctor.voteTargetPlayerId = null;
    const second = computeRequiredAction(state, doctor.playerId);
    expect(second.type).toBe('VOTE');
    expect(second.alreadySubmitted).toBe(true);
  });

  it('returns NONE for dead players even during action phases', () => {
    const state = createInitialMatchState(playerSeeds, now);
    state.phase = 'DAY_VOTE';

    const wolf = findPlayer(state, 'WEREWOLF');
    wolf.alive = false;

    expect(computeRequiredAction(state, wolf.playerId)).toEqual({
      type: 'NONE',
      allowedTargets: [],
      alreadySubmitted: true,
    });
  });
});
