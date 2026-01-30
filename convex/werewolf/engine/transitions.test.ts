import type { MatchState } from './state';
import { createInitialMatchState, getPhaseDurationMs } from './state';
import { advancePhase } from './transitions';

const playerSeeds = Array.from({ length: 8 }, (_, index) => ({
  playerId: `p:${index + 1}`,
  displayName: `Player ${index + 1}`,
}));

const startTime = 1_700_000_000_000;

function step(state: MatchState) {
  const now = state.phaseEndsAt;
  return { now, next: advancePhase(state, now) };
}

describe('advancePhase', () => {
  it('advances through the phase order and increments counters', () => {
    let state = createInitialMatchState(playerSeeds, startTime);

    const lobbyStep = step(state);
    expect(lobbyStep.next.phase).toBe('NIGHT');
    expect(lobbyStep.next.phaseStartedAt).toBe(lobbyStep.now);
    expect(lobbyStep.next.phaseEndsAt).toBe(lobbyStep.now + getPhaseDurationMs('NIGHT'));
    expect(lobbyStep.next.dayNumber).toBe(0);
    expect(lobbyStep.next.nightNumber).toBe(1);
    state = lobbyStep.next;

    const nightStep = step(state);
    expect(nightStep.next.phase).toBe('DAY_ANNOUNCE');
    expect(nightStep.next.phaseStartedAt).toBe(nightStep.now);
    expect(nightStep.next.phaseEndsAt).toBe(nightStep.now + getPhaseDurationMs('DAY_ANNOUNCE'));
    expect(nightStep.next.dayNumber).toBe(1);
    expect(nightStep.next.nightNumber).toBe(1);
    state = nightStep.next;

    const announceStep = step(state);
    expect(announceStep.next.phase).toBe('DAY_OPENING');
    expect(announceStep.next.phaseEndsAt).toBe(announceStep.now + getPhaseDurationMs('DAY_OPENING'));
    expect(announceStep.next.dayNumber).toBe(1);
    state = announceStep.next;

    const openingStep = step(state);
    expect(openingStep.next.phase).toBe('DAY_DISCUSSION');
    expect(openingStep.next.phaseEndsAt).toBe(
      openingStep.now + getPhaseDurationMs('DAY_DISCUSSION'),
    );
    expect(openingStep.next.dayNumber).toBe(1);
    state = openingStep.next;

    const discussionStep = step(state);
    expect(discussionStep.next.phase).toBe('DAY_VOTE');
    expect(discussionStep.next.phaseEndsAt).toBe(
      discussionStep.now + getPhaseDurationMs('DAY_VOTE'),
    );
    expect(discussionStep.next.dayNumber).toBe(1);
    state = discussionStep.next;

    const voteStep = step(state);
    expect(voteStep.next.phase).toBe('DAY_RESOLUTION');
    expect(voteStep.next.phaseEndsAt).toBe(
      voteStep.now + getPhaseDurationMs('DAY_RESOLUTION'),
    );
    expect(voteStep.next.dayNumber).toBe(1);
    state = voteStep.next;

    const resolutionStep = step(state);
    expect(resolutionStep.next.phase).toBe('NIGHT');
    expect(resolutionStep.next.phaseEndsAt).toBe(
      resolutionStep.now + getPhaseDurationMs('NIGHT'),
    );
    expect(resolutionStep.next.dayNumber).toBe(1);
    expect(resolutionStep.next.nightNumber).toBe(2);
  });

  it('ends the match from day resolution when a winner is set', () => {
    const state = createInitialMatchState(playerSeeds, startTime);
    state.phase = 'DAY_RESOLUTION';
    state.phaseStartedAt = startTime;
    state.phaseEndsAt = startTime + getPhaseDurationMs('DAY_RESOLUTION');
    state.dayNumber = 3;
    state.nightNumber = 3;
    state.winner = 'VILLAGERS';

    const now = state.phaseEndsAt;
    const ended = advancePhase(state, now);

    expect(ended.phase).toBe('ENDED');
    expect(ended.phaseStartedAt).toBe(now);
    expect(ended.phaseEndsAt).toBe(now + getPhaseDurationMs('ENDED'));
    expect(ended.endedAt).toBe(now);
    expect(ended.dayNumber).toBe(3);
    expect(ended.nightNumber).toBe(3);
  });

  it('does not advance before the phase timer expires', () => {
    const state = createInitialMatchState(playerSeeds, startTime);
    const earlyNow = state.phaseEndsAt - 1;

    const next = advancePhase(state, earlyNow);

    expect(next.phase).toBe('LOBBY');
    expect(next.phaseStartedAt).toBe(state.phaseStartedAt);
    expect(next.phaseEndsAt).toBe(state.phaseEndsAt);
    expect(next.dayNumber).toBe(state.dayNumber);
    expect(next.nightNumber).toBe(state.nightNumber);
  });
});
