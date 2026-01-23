import type { PlayerId } from '../types';
import type { WerewolfEvent } from './events';
import { createNarratorEvent } from './events';
import type { MatchPlayerState, MatchState } from './state';

export type NarratorUpdate = {
  publicSummary: string;
  events: WerewolfEvent[];
};

export function buildNarratorUpdate(params: {
  from: MatchState;
  to: MatchState;
  now: number;
  eliminatedPlayerId?: PlayerId;
  wolfKillTargetPlayerId?: PlayerId;
}): NarratorUpdate {
  if (params.from.phase === params.to.phase) {
    return { publicSummary: params.to.publicSummary, events: [] };
  }

  const summary = buildPublicSummary(params);
  return {
    publicSummary: summary,
    events: [
      createNarratorEvent({
        at: params.now,
        text: summary,
      }),
    ],
  };
}

function buildPublicSummary(params: {
  to: MatchState;
  eliminatedPlayerId?: PlayerId;
  wolfKillTargetPlayerId?: PlayerId;
}): string {
  const playersRemaining = `${params.to.playersAlive} players remain.`;
  switch (params.to.phase) {
    case 'NIGHT':
      return `Night ${params.to.nightNumber} begins. ${playersRemaining}`;
    case 'DAY_ANNOUNCE': {
      const nightOutcome = formatNightOutcome(params.to, params.eliminatedPlayerId, params.wolfKillTargetPlayerId);
      return `Day ${params.to.dayNumber} dawns. ${nightOutcome} ${playersRemaining}`;
    }
    case 'DAY_OPENING':
      return `Day ${params.to.dayNumber} opening statements begin. ${playersRemaining}`;
    case 'DAY_DISCUSSION':
      return `Day ${params.to.dayNumber} discussion is open. ${playersRemaining}`;
    case 'DAY_VOTE':
      return `Day ${params.to.dayNumber} voting begins. ${playersRemaining}`;
    case 'DAY_RESOLUTION': {
      const voteOutcome = formatVoteOutcome(params.to, params.eliminatedPlayerId);
      return `Votes are in. ${voteOutcome} ${playersRemaining}`;
    }
    case 'ENDED':
      return params.to.winner ? `Game ended. ${params.to.winner} win.` : 'Game ended.';
    case 'LOBBY':
    default:
      return params.to.publicSummary;
  }
}

function formatNightOutcome(
  state: MatchState,
  eliminatedPlayerId?: PlayerId,
  wolfKillTargetPlayerId?: PlayerId,
): string {
  if (eliminatedPlayerId) {
    const player = findPlayer(state, eliminatedPlayerId);
    return `${player.displayName} was killed overnight (${player.role}).`;
  }
  if (wolfKillTargetPlayerId) {
    return 'No one died overnight. A life was saved.';
  }
  return 'No one died overnight.';
}

function formatVoteOutcome(state: MatchState, eliminatedPlayerId?: PlayerId): string {
  if (eliminatedPlayerId) {
    const player = findPlayer(state, eliminatedPlayerId);
    return `${player.displayName} was eliminated (${player.role}).`;
  }
  return 'No one was eliminated.';
}

function findPlayer(state: MatchState, playerId: PlayerId): MatchPlayerState {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) {
    throw new Error(`Missing player ${playerId}`);
  }
  return player;
}
