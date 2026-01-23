import type { Phase } from '../types';
import type { MatchState } from './state';
import { PHASE_DURATIONS_MS } from './state';

export type AdvancePhaseOptions = {
  allowEarly?: boolean;
};

export function advancePhase(
  state: MatchState,
  now: number,
  options: AdvancePhaseOptions = {},
): MatchState {
  if (state.phase === 'ENDED') {
    return state;
  }

  if (!options.allowEarly && now < state.phaseEndsAt) {
    return state;
  }

  const nextPhase = nextPhaseFor(state);
  const dayNumber = state.dayNumber + (state.phase === 'NIGHT' && nextPhase === 'DAY_ANNOUNCE' ? 1 : 0);
  const nightNumber =
    state.nightNumber + (state.phase === 'DAY_RESOLUTION' && nextPhase === 'NIGHT' ? 1 : 0);

  const nextState: MatchState = {
    ...state,
    phase: nextPhase,
    dayNumber,
    nightNumber,
    phaseStartedAt: now,
    phaseEndsAt: now + PHASE_DURATIONS_MS[nextPhase],
  };

  if (nextPhase === 'ENDED') {
    nextState.endedAt = state.endedAt ?? now;
  }

  return nextState;
}

function nextPhaseFor(state: MatchState): Phase {
  switch (state.phase) {
    case 'LOBBY':
      return 'NIGHT';
    case 'NIGHT':
      return 'DAY_ANNOUNCE';
    case 'DAY_ANNOUNCE':
      return 'DAY_OPENING';
    case 'DAY_OPENING':
      return 'DAY_DISCUSSION';
    case 'DAY_DISCUSSION':
      return 'DAY_VOTE';
    case 'DAY_VOTE':
      return 'DAY_RESOLUTION';
    case 'DAY_RESOLUTION':
      return state.winner ? 'ENDED' : 'NIGHT';
    case 'ENDED':
      return 'ENDED';
    default: {
      const unreachable: never = state.phase;
      throw new Error(`Unknown phase ${unreachable}`);
    }
  }
}
