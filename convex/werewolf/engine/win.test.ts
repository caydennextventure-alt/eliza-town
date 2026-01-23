import type { MatchState } from './state';
import { createInitialMatchState } from './state';
import { evaluateWinCondition } from './win';

const playerSeeds = Array.from({ length: 8 }, (_, index) => ({
  playerId: `p:${index + 1}`,
  displayName: `Player ${index + 1}`,
}));

const now = 1_700_000_000_000;

function refreshPlayersAlive(state: MatchState) {
  state.playersAlive = state.players.filter((player) => player.alive).length;
}

describe('evaluateWinCondition', () => {
  it('declares werewolves winners when they reach parity', () => {
    const state = createInitialMatchState(playerSeeds, now);

    const nonWolves = state.players.filter((player) => player.role !== 'WEREWOLF');
    nonWolves.slice(0, 4).forEach((player) => {
      player.alive = false;
    });
    refreshPlayersAlive(state);

    expect(evaluateWinCondition(state)).toBe('WEREWOLVES');
  });

  it('declares villagers winners when no wolves remain', () => {
    const state = createInitialMatchState(playerSeeds, now);

    state.players
      .filter((player) => player.role === 'WEREWOLF')
      .forEach((player) => {
        player.alive = false;
      });
    refreshPlayersAlive(state);

    expect(evaluateWinCondition(state)).toBe('VILLAGERS');
  });

  it('returns undefined when no team has won yet', () => {
    const state = createInitialMatchState(playerSeeds, now);

    expect(evaluateWinCondition(state)).toBeUndefined();
  });
});
