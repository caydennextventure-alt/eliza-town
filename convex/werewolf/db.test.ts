import type { Doc, Id } from '../_generated/dataModel';
import { createPublicMessageEvent, createWolfChatMessageEvent } from './engine/events';
import { createInitialMatchState } from './engine/state';
import {
  applyMatchStateToDoc,
  applyPlayerStateToDoc,
  buildEventInserts,
  matchSnapshotToState,
} from './db';

const matchId = 'match:1';
const worldId = 'world:1' as Id<'worlds'>;

function baseMatchDoc(overrides: Partial<Doc<'werewolfMatches'>> = {}): Doc<'werewolfMatches'> {
  return {
    _id: matchId as Id<'werewolfMatches'>,
    _creationTime: 0,
    worldId,
    queueId: 'werewolf-default',
    buildingInstanceId: 'building:1',
    phase: 'NIGHT',
    dayNumber: 1,
    phaseStartedAt: 1_000,
    phaseEndsAt: 2_000,
    playersAlive: 99,
    startedAt: 500,
    publicSummary: 'summary',
    nightNumber: 1,
    ...overrides,
  };
}

function basePlayerDoc(
  playerId: string,
  seat: number,
  overrides: Partial<Doc<'werewolfPlayers'>> = {},
): Doc<'werewolfPlayers'> {
  return {
    _id: `${playerId}:doc` as Id<'werewolfPlayers'>,
    _creationTime: 0,
    matchId,
    playerId,
    displayName: `Player ${seat}`,
    seat,
    role: 'VILLAGER',
    alive: true,
    ready: false,
    missedResponses: 0,
    seerHistory: [],
    ...overrides,
  };
}

describe('matchSnapshotToState', () => {
  it('sorts players by seat and defaults night action', () => {
    const match = baseMatchDoc({ playersAlive: 2 });
    const playerA = basePlayerDoc('p:1', 2);
    const playerB = basePlayerDoc('p:2', 1, {
      nightAction: { wolfKillTargetPlayerId: 'p:3' },
    });

    const state = matchSnapshotToState({ match, players: [playerA, playerB] });

    expect(state.players.map((player) => player.seat)).toEqual([1, 2]);
    expect(state.players[0].playerId).toBe('p:2');
    expect(state.players[0].nightAction).toEqual({ wolfKillTargetPlayerId: 'p:3' });
    expect(state.players[1].nightAction).toEqual({});
    expect(state.playersAlive).toBe(2);
  });
});

describe('applyMatchStateToDoc', () => {
  it('updates match fields and clears optional values', () => {
    const match = baseMatchDoc({
      winner: 'WEREWOLVES',
      endedAt: 9_000,
      lastAdvanceJobAt: 4_000,
    });
    const state = createInitialMatchState(
      [
        { playerId: 'p:1', displayName: 'Player 1' },
        { playerId: 'p:2', displayName: 'Player 2' },
        { playerId: 'p:3', displayName: 'Player 3' },
        { playerId: 'p:4', displayName: 'Player 4' },
        { playerId: 'p:5', displayName: 'Player 5' },
        { playerId: 'p:6', displayName: 'Player 6' },
        { playerId: 'p:7', displayName: 'Player 7' },
        { playerId: 'p:8', displayName: 'Player 8' },
      ],
      1_234,
    );
    state.phase = 'DAY_VOTE';
    state.publicSummary = 'Updated';

    const updated = applyMatchStateToDoc(match, state);

    expect(updated.phase).toBe('DAY_VOTE');
    expect(updated.publicSummary).toBe('Updated');
    expect(updated.lastAdvanceJobAt).toBe(4_000);
    expect(Object.prototype.hasOwnProperty.call(updated, 'winner')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(updated, 'endedAt')).toBe(false);
  });
});

describe('applyPlayerStateToDoc', () => {
  it('clears optional fields while preserving stored metadata', () => {
    const playerDoc = basePlayerDoc('p:1', 1, {
      eliminatedAt: 2_000,
      revealedRole: true,
      voteTargetPlayerId: 'p:2',
      nightSubmittedAt: { wolfKill: 3_000 },
      nightAction: { wolfKillTargetPlayerId: 'p:2' },
    });
    const state = matchSnapshotToState({
      match: baseMatchDoc(),
      players: [playerDoc],
    }).players[0];
    state.voteTargetPlayerId = undefined;
    state.eliminatedAt = undefined;
    state.revealedRole = undefined;
    state.nightAction = {};

    const updated = applyPlayerStateToDoc(playerDoc, state);

    expect(updated.nightSubmittedAt).toEqual({ wolfKill: 3_000 });
    expect(Object.prototype.hasOwnProperty.call(updated, 'voteTargetPlayerId')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(updated, 'eliminatedAt')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(updated, 'revealedRole')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(updated, 'nightAction')).toBe(false);
  });

  it('keeps explicit abstain votes as null', () => {
    const playerDoc = basePlayerDoc('p:1', 1);
    const state = matchSnapshotToState({
      match: baseMatchDoc(),
      players: [playerDoc],
    }).players[0];
    state.voteTargetPlayerId = null;

    const updated = applyPlayerStateToDoc(playerDoc, state);

    expect(updated.voteTargetPlayerId).toBeNull();
  });
});

describe('buildEventInserts', () => {
  it('assigns monotonic seq values', () => {
    const events = [
      createPublicMessageEvent({
        at: 1_000,
        playerId: 'p:1',
        text: 'Hello',
        kind: 'DISCUSSION',
      }),
      createWolfChatMessageEvent({
        at: 1_200,
        fromWolfId: 'p:2',
        text: 'Target p:3',
      }),
    ];

    const inserts = buildEventInserts(matchId, 41, events);

    expect(inserts.map((event) => event.seq)).toEqual([41, 42]);
    expect(inserts[0].matchId).toBe(matchId);
    expect(inserts[0].type).toBe('PUBLIC_MESSAGE');
    expect(inserts[1].type).toBe('WOLF_CHAT_MESSAGE');
  });
});
