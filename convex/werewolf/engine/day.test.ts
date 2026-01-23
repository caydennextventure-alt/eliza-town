import type { MatchState } from './state';
import { createInitialMatchState } from './state';
import { applyDayAction, resolveDayVote } from './day';

const playerSeeds = Array.from({ length: 8 }, (_, index) => ({
  playerId: `p:${index + 1}`,
  displayName: `Player ${index + 1}`,
}));

const baseTime = 1_700_000_000_000;

function findPlayer(state: MatchState, playerId: string) {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) {
    throw new Error(`Missing player ${playerId}`);
  }
  return player;
}

describe('day actions', () => {
  it('allows exactly one opening statement per alive player', () => {
    let state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'DAY_OPENING';
    state.dayNumber = 1;

    const speaker = state.players[0];
    state = applyDayAction(state, {
      type: 'SAY_PUBLIC',
      playerId: speaker.playerId,
      text: 'Hello town.',
      kind: 'OPENING',
    });

    expect(findPlayer(state, speaker.playerId).didOpeningForDay).toBe(state.dayNumber);

    expect(() =>
      applyDayAction(state, {
        type: 'SAY_PUBLIC',
        playerId: speaker.playerId,
        text: 'Second time.',
        kind: 'OPENING',
      }),
    ).toThrow('Opening statement already submitted');
  });

  it('resolves tie votes with no elimination', () => {
    let state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'DAY_VOTE';

    const [targetA, targetB] = state.players.slice(0, 2);
    const voters = state.players.slice(2, 6);

    state = applyDayAction(state, {
      type: 'CAST_VOTE',
      playerId: voters[0].playerId,
      targetPlayerId: targetA.playerId,
    });
    state = applyDayAction(state, {
      type: 'CAST_VOTE',
      playerId: voters[1].playerId,
      targetPlayerId: targetA.playerId,
    });
    state = applyDayAction(state, {
      type: 'CAST_VOTE',
      playerId: voters[2].playerId,
      targetPlayerId: targetB.playerId,
    });
    state = applyDayAction(state, {
      type: 'CAST_VOTE',
      playerId: voters[3].playerId,
      targetPlayerId: targetB.playerId,
    });

    const result = resolveDayVote(state, baseTime + 20_000);

    expect(result.eliminatedPlayerId).toBeUndefined();
    expect(result.nextState.playersAlive).toBe(state.playersAlive);
    expect(findPlayer(result.nextState, targetA.playerId).alive).toBe(true);
    expect(findPlayer(result.nextState, targetB.playerId).alive).toBe(true);
  });

  it('eliminates the unique vote leader', () => {
    let state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'DAY_VOTE';

    const [targetA, targetB] = state.players.slice(0, 2);
    const voters = state.players.slice(2, 6);

    state = applyDayAction(state, {
      type: 'CAST_VOTE',
      playerId: voters[0].playerId,
      targetPlayerId: targetA.playerId,
    });
    state = applyDayAction(state, {
      type: 'CAST_VOTE',
      playerId: voters[1].playerId,
      targetPlayerId: targetA.playerId,
    });
    state = applyDayAction(state, {
      type: 'CAST_VOTE',
      playerId: voters[2].playerId,
      targetPlayerId: targetA.playerId,
    });
    state = applyDayAction(state, {
      type: 'CAST_VOTE',
      playerId: voters[3].playerId,
      targetPlayerId: targetB.playerId,
    });

    const now = baseTime + 25_000;
    const result = resolveDayVote(state, now);

    expect(result.eliminatedPlayerId).toBe(targetA.playerId);
    const eliminated = findPlayer(result.nextState, targetA.playerId);
    expect(eliminated.alive).toBe(false);
    expect(eliminated.revealedRole).toBe(true);
    expect(eliminated.eliminatedAt).toBe(now);
    expect(result.nextState.playersAlive).toBe(state.playersAlive - 1);

    const voter = findPlayer(result.nextState, voters[0].playerId);
    expect(voter.voteTargetPlayerId).toBeUndefined();
  });

  it('prevents dead players from voting', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'DAY_VOTE';

    const deadPlayer = state.players[0];
    const target = state.players[1];
    deadPlayer.alive = false;

    expect(() =>
      applyDayAction(state, {
        type: 'CAST_VOTE',
        playerId: deadPlayer.playerId,
        targetPlayerId: target.playerId,
      }),
    ).toThrow('Dead players cannot vote');
  });
});
