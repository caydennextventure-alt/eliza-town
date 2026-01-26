import type { Role } from '../types';
import type { MatchPlayerState, MatchState } from './state';
import { applyNightAction, resolveNight } from './night';
import { createInitialMatchState } from './state';

const playerSeeds = Array.from({ length: 8 }, (_, index) => ({
  playerId: `p:${index + 1}`,
  displayName: `Player ${index + 1}`,
}));

const baseTime = 1_700_000_000_000;

function findPlayerByRole(state: MatchState, role: Role): MatchPlayerState {
  const player = state.players.find((entry) => entry.role === role);
  if (!player) {
    throw new Error(`Missing player for role ${role}`);
  }
  return player;
}

function findPlayerById(state: MatchState, playerId: string): MatchPlayerState {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) {
    throw new Error(`Missing player ${playerId}`);
  }
  return player;
}

describe('night actions', () => {
  it('prevents a wolf kill when the doctor protects the target', () => {
    let state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'NIGHT';

    const wolf = findPlayerByRole(state, 'WEREWOLF');
    const doctor = findPlayerByRole(state, 'DOCTOR');
    const target = state.players.find(
      (player) => player.role !== 'WEREWOLF' && player.playerId !== doctor.playerId,
    );
    if (!target) {
      throw new Error('Missing non-wolf target');
    }

    state = applyNightAction(state, {
      type: 'WOLF_KILL',
      playerId: wolf.playerId,
      targetPlayerId: target.playerId,
    });
    state = applyNightAction(state, {
      type: 'DOCTOR_PROTECT',
      playerId: doctor.playerId,
      targetPlayerId: target.playerId,
    });

    const resolution = resolveNight(state, baseTime + 30_000);

    expect(resolution.eliminatedPlayerId).toBeUndefined();
    expect(resolution.protectedPlayerId).toBe(target.playerId);
    expect(findPlayerById(resolution.nextState, target.playerId).alive).toBe(true);
    expect(resolution.nextState.playersAlive).toBe(state.playersAlive);
  });

  it('stores seer inspection results on resolution', () => {
    let state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'NIGHT';

    const seer = findPlayerByRole(state, 'SEER');
    const target = findPlayerByRole(state, 'WEREWOLF');

    state = applyNightAction(state, {
      type: 'SEER_INSPECT',
      playerId: seer.playerId,
      targetPlayerId: target.playerId,
    });

    const resolution = resolveNight(state, baseTime + 15_000);
    const updatedSeer = findPlayerById(resolution.nextState, seer.playerId);

    expect(updatedSeer.seerHistory).toEqual([
      {
        night: state.nightNumber,
        targetPlayerId: target.playerId,
        result: 'WEREWOLF',
      },
    ]);
    expect(resolution.seerResult).toEqual({
      night: state.nightNumber,
      targetPlayerId: target.playerId,
      result: 'WEREWOLF',
    });
  });

  it('selects a default non-wolf target when wolves do not act', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'NIGHT';

    const resolution = resolveNight(state, baseTime + 45_000);

    expect(resolution.eliminatedPlayerId).toBeDefined();
    const eliminated = findPlayerById(resolution.nextState, resolution.eliminatedPlayerId ?? '');
    expect(eliminated.alive).toBe(false);
    expect(eliminated.role).not.toBe('WEREWOLF');
    expect(eliminated.eliminatedAt).toBe(baseTime + 45_000);
    expect(resolution.nextState.playersAlive).toBe(state.playersAlive - 1);
  });

  it('eliminates players with repeated missed responses at night resolution', () => {
    let state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'NIGHT';

    const wolf = findPlayerByRole(state, 'WEREWOLF');
    const timeoutPlayer = state.players.find(
      (player) => player.role !== 'WEREWOLF' && player.playerId !== wolf.playerId,
    );
    if (!timeoutPlayer) {
      throw new Error('Missing timeout target');
    }
    const wolfTarget = state.players.find(
      (player) =>
        player.role !== 'WEREWOLF' && player.playerId !== timeoutPlayer.playerId,
    );
    if (!wolfTarget) {
      throw new Error('Missing wolf kill target');
    }

    state = {
      ...state,
      players: state.players.map((player) =>
        player.playerId === timeoutPlayer.playerId
          ? { ...player, missedResponses: 4 }
          : player,
      ),
    };
    state = applyNightAction(state, {
      type: 'WOLF_KILL',
      playerId: wolf.playerId,
      targetPlayerId: wolfTarget.playerId,
    });

    const resolution = resolveNight(state, baseTime + 45_000);

    expect(resolution.timeoutEliminatedPlayerIds).toEqual([timeoutPlayer.playerId]);
    expect(findPlayerById(resolution.nextState, timeoutPlayer.playerId).alive).toBe(false);
    expect(findPlayerById(resolution.nextState, wolfTarget.playerId).alive).toBe(false);
  });
});
