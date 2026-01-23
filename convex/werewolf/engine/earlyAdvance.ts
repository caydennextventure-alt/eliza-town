import type { MatchState } from './state';

export function canAdvancePhaseEarly(state: MatchState): boolean {
  if (state.phase === 'LOBBY') {
    return state.players.filter((player) => player.alive).every((player) => player.ready);
  }

  if (state.phase === 'DAY_VOTE') {
    return state.players
      .filter((player) => player.alive)
      .every((player) => player.voteTargetPlayerId !== undefined);
  }

  if (state.phase === 'DAY_OPENING') {
    return state.players
      .filter((player) => player.alive)
      .every((player) => player.didOpeningForDay === state.dayNumber);
  }

  return false;
}
