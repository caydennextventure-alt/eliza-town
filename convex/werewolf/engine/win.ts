import type { MatchState, WinningTeam } from './state';

export function evaluateWinCondition(state: MatchState): WinningTeam | undefined {
  const alivePlayers = state.players.filter((player) => player.alive);
  const aliveWolves = alivePlayers.filter((player) => player.role === 'WEREWOLF').length;
  const aliveNonWolves = alivePlayers.length - aliveWolves;

  if (aliveWolves === 0) {
    return 'VILLAGERS';
  }

  if (aliveWolves >= aliveNonWolves) {
    return 'WEREWOLVES';
  }

  return undefined;
}
