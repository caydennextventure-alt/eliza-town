import type { MatchState } from './engine/state';
import { PHASE_DURATIONS_MS, createInitialMatchState } from './engine/state';
import { applyDayAction } from './engine/day';
import { applyNightAction } from './engine/night';
import type { Phase } from './types';
import { advanceMatchPhase } from './advancePhase';

const playerSeeds = Array.from({ length: 8 }, (_, index) => ({
  playerId: `p:${index + 1}`,
  displayName: `Player ${index + 1}`,
}));

const baseTime = 1_700_000_000_000;

function withPhase(state: MatchState, phase: Phase, startAt: number): MatchState {
  return {
    ...state,
    phase,
    phaseStartedAt: startAt,
    phaseEndsAt: startAt + PHASE_DURATIONS_MS[phase],
  };
}

describe('advanceMatchPhase', () => {
  it('resolves night actions and advances to day announce', () => {
    let state = withPhase(createInitialMatchState(playerSeeds, baseTime), 'NIGHT', baseTime);
    const wolf = state.players.find((player) => player.role === 'WEREWOLF');
    if (!wolf) {
      throw new Error('Missing wolf');
    }
    const target = state.players.find((player) => player.role !== 'WEREWOLF');
    if (!target) {
      throw new Error('Missing non-wolf target');
    }

    state = applyNightAction(state, {
      type: 'WOLF_KILL',
      playerId: wolf.playerId,
      targetPlayerId: target.playerId,
    });

    const now = state.phaseEndsAt;
    const result = advanceMatchPhase(state, now);
    const expectedSummary = `Day 1 dawns. ${target.displayName} was killed overnight (${target.role}). ${result.nextState.playersAlive} players remain.`;

    expect(result.advanced).toBe(true);
    expect(result.nextState.phase).toBe('DAY_ANNOUNCE');
    expect(result.nextState.phaseEndsAt).toBe(now + PHASE_DURATIONS_MS.DAY_ANNOUNCE);
    const eliminated = result.nextState.players.find((player) => player.playerId === target.playerId);
    expect(eliminated?.alive).toBe(false);
    expect(result.nextState.playersAlive).toBe(state.playersAlive - 1);
    expect(result.nextState.publicSummary).toBe(expectedSummary);
    expect(result.events.map((event) => event.type)).toEqual([
      'PHASE_CHANGED',
      'NIGHT_RESULT',
      'PLAYER_ELIMINATED',
      'NARRATOR',
    ]);
    const narratorEvent = result.events.find((event) => event.type === 'NARRATOR');
    if (!narratorEvent || narratorEvent.type !== 'NARRATOR') {
      throw new Error('Missing narrator event');
    }
    expect(narratorEvent.payload.text).toBe(expectedSummary);
  });

  it('resolves votes and advances to day resolution', () => {
    let state = withPhase(createInitialMatchState(playerSeeds, baseTime), 'DAY_VOTE', baseTime);
    state = { ...state, dayNumber: 1 };

    const target = state.players[0];
    state = state.players.reduce(
      (current, player) =>
        applyDayAction(current, {
          type: 'CAST_VOTE',
          playerId: player.playerId,
          targetPlayerId: target.playerId,
        }),
      state,
    );

    const now = state.phaseEndsAt;
    const result = advanceMatchPhase(state, now);
    const expectedSummary = `Votes are in. ${target.displayName} was eliminated (${target.role}). ${result.nextState.playersAlive} players remain.`;

    expect(result.nextState.phase).toBe('DAY_RESOLUTION');
    const eliminated = result.nextState.players.find((player) => player.playerId === target.playerId);
    expect(eliminated?.alive).toBe(false);
    expect(result.nextState.publicSummary).toBe(expectedSummary);
    expect(result.events.map((event) => event.type)).toEqual([
      'PHASE_CHANGED',
      'PLAYER_ELIMINATED',
      'NARRATOR',
    ]);
    const narratorEvent = result.events.find((event) => event.type === 'NARRATOR');
    if (!narratorEvent || narratorEvent.type !== 'NARRATOR') {
      throw new Error('Missing narrator event');
    }
    expect(narratorEvent.payload.text).toBe(expectedSummary);
  });

  it('advances day vote early when all votes are in', () => {
    let state = withPhase(createInitialMatchState(playerSeeds, baseTime), 'DAY_VOTE', baseTime);
    state = { ...state, dayNumber: 1 };

    const target = state.players[0];
    state = state.players.reduce(
      (current, player) =>
        applyDayAction(current, {
          type: 'CAST_VOTE',
          playerId: player.playerId,
          targetPlayerId: target.playerId,
        }),
      state,
    );

    const now = state.phaseStartedAt + 1;
    const result = advanceMatchPhase(state, now);

    expect(result.advanced).toBe(true);
    expect(result.nextState.phase).toBe('DAY_RESOLUTION');
    expect(result.nextState.phaseEndsAt).toBe(now + PHASE_DURATIONS_MS.DAY_RESOLUTION);
  });

  it('advances day opening early when all openings are in', () => {
    let state = withPhase(createInitialMatchState(playerSeeds, baseTime), 'DAY_OPENING', baseTime);
    state = { ...state, dayNumber: 1 };

    state = state.players.reduce(
      (current, player) =>
        applyDayAction(current, {
          type: 'SAY_PUBLIC',
          playerId: player.playerId,
          text: `Opening from ${player.playerId}`,
          kind: 'OPENING',
        }),
      state,
    );

    const now = state.phaseStartedAt + 1;
    const result = advanceMatchPhase(state, now);

    expect(result.advanced).toBe(true);
    expect(result.nextState.phase).toBe('DAY_DISCUSSION');
    expect(result.nextState.phaseEndsAt).toBe(now + PHASE_DURATIONS_MS.DAY_DISCUSSION);
  });

  it('does not advance day opening early when openings are missing', () => {
    let state = withPhase(createInitialMatchState(playerSeeds, baseTime), 'DAY_OPENING', baseTime);
    state = { ...state, dayNumber: 1 };

    state = state.players.slice(0, -1).reduce(
      (current, player) =>
        applyDayAction(current, {
          type: 'SAY_PUBLIC',
          playerId: player.playerId,
          text: `Opening from ${player.playerId}`,
          kind: 'OPENING',
        }),
      state,
    );

    const now = state.phaseStartedAt + 1;
    const result = advanceMatchPhase(state, now);

    expect(result.advanced).toBe(false);
    expect(result.nextState.phase).toBe('DAY_OPENING');
  });

  it('advances lobby early when all players are ready', () => {
    let state = withPhase(createInitialMatchState(playerSeeds, baseTime), 'LOBBY', baseTime);
    state = {
      ...state,
      players: state.players.map((player) => ({ ...player, ready: true })),
    };

    const now = state.phaseStartedAt + 1;
    const result = advanceMatchPhase(state, now);

    expect(result.advanced).toBe(true);
    expect(result.nextState.phase).toBe('NIGHT');
    expect(result.nextState.phaseEndsAt).toBe(now + PHASE_DURATIONS_MS.NIGHT);
  });

  it('does not advance lobby early when players are not all ready', () => {
    let state = withPhase(createInitialMatchState(playerSeeds, baseTime), 'LOBBY', baseTime);
    state = {
      ...state,
      players: state.players.map((player, index) => ({
        ...player,
        ready: index === 0,
      })),
    };

    const now = state.phaseStartedAt + 1;
    const result = advanceMatchPhase(state, now);

    expect(result.advanced).toBe(false);
    expect(result.nextState.phase).toBe('LOBBY');
  });

  it('does not advance early when votes are missing', () => {
    let state = withPhase(createInitialMatchState(playerSeeds, baseTime), 'DAY_VOTE', baseTime);
    state = { ...state, dayNumber: 1 };

    const target = state.players[0];
    state = state.players.slice(0, -1).reduce(
      (current, player) =>
        applyDayAction(current, {
          type: 'CAST_VOTE',
          playerId: player.playerId,
          targetPlayerId: target.playerId,
        }),
      state,
    );

    const now = state.phaseStartedAt + 1;
    const result = advanceMatchPhase(state, now);

    expect(result.advanced).toBe(false);
    expect(result.nextState.phase).toBe(state.phase);
  });

  it('summarizes nights where no one dies', () => {
    let state = withPhase(createInitialMatchState(playerSeeds, baseTime), 'NIGHT', baseTime);
    const wolf = state.players.find((player) => player.role === 'WEREWOLF');
    if (!wolf) {
      throw new Error('Missing wolf');
    }
    const doctor = state.players.find((player) => player.role === 'DOCTOR');
    if (!doctor) {
      throw new Error('Missing doctor');
    }
    const target = state.players.find((player) => player.role !== 'WEREWOLF');
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

    const now = state.phaseEndsAt;
    const result = advanceMatchPhase(state, now);
    const expectedSummary = `Day 1 dawns. No one died overnight. A life was saved. ${result.nextState.playersAlive} players remain.`;

    expect(result.nextState.phase).toBe('DAY_ANNOUNCE');
    expect(result.nextState.publicSummary).toBe(expectedSummary);
    const narratorEvent = result.events.find((event) => event.type === 'NARRATOR');
    if (!narratorEvent || narratorEvent.type !== 'NARRATOR') {
      throw new Error('Missing narrator event');
    }
    expect(narratorEvent.payload.text).toBe(expectedSummary);
  });

  it('ends the match when day resolution completes with a winner', () => {
    let state = withPhase(createInitialMatchState(playerSeeds, baseTime), 'DAY_RESOLUTION', baseTime);
    state = { ...state, dayNumber: 1, winner: 'VILLAGERS' };

    const now = state.phaseEndsAt;
    const result = advanceMatchPhase(state, now);
    const expectedSummary = 'Game ended. VILLAGERS win.';

    expect(result.nextState.phase).toBe('ENDED');
    expect(result.nextState.endedAt).toBe(now);
    expect(result.nextState.publicSummary).toBe(expectedSummary);
    expect(result.events.map((event) => event.type)).toEqual([
      'PHASE_CHANGED',
      'GAME_ENDED',
      'NARRATOR',
    ]);
    const narratorEvent = result.events.find((event) => event.type === 'NARRATOR');
    if (!narratorEvent || narratorEvent.type !== 'NARRATOR') {
      throw new Error('Missing narrator event');
    }
    expect(narratorEvent.payload.text).toBe(expectedSummary);
  });
});
