import type { Doc, Id } from '../_generated/dataModel';
import { createInitialMatchState } from './engine/state';
import type { MatchEventDoc } from './queries';
import {
  buildMatchStateView,
  filterVisibleEvents,
  isMatchActive,
  resolveViewerContext,
} from './queries';

const playerSeeds = Array.from({ length: 8 }, (_, index) => ({
  playerId: `p:${index + 1}`,
  displayName: `Player ${index + 1}`,
}));

const baseTime = 1_700_000_000_000;

describe('filterVisibleEvents', () => {
  const state = createInitialMatchState(playerSeeds, baseTime);
  const privateRecipient = state.players.find((player) => player.role !== 'WEREWOLF');
  if (!privateRecipient) {
    throw new Error('Expected a non-werewolf player');
  }
  const wolf = state.players.find((player) => player.role === 'WEREWOLF');
  if (!wolf) {
    throw new Error('Expected a werewolf player');
  }

  const events: MatchEventDoc[] = [
    {
      seq: 1,
      at: baseTime,
      type: 'PUBLIC_MESSAGE',
      visibility: 'PUBLIC',
      payload: { playerId: 'p:1', text: 'Hello' },
    },
    {
      seq: 2,
      at: baseTime + 1_000,
      type: 'WOLF_CHAT_MESSAGE',
      visibility: 'WOLVES',
      payload: { fromWolfId: wolf.playerId, text: 'Secret' },
    },
    {
      seq: 3,
      at: baseTime + 2_000,
      type: 'NARRATOR',
      visibility: { kind: 'PLAYER_PRIVATE', playerId: privateRecipient.playerId },
      payload: { text: 'Private result' },
    },
  ];

  it('returns only public events for spectators', () => {
    const viewer = resolveViewerContext(state.players);
    const visible = filterVisibleEvents(events, viewer);
    expect(visible.map((event) => event.seq)).toEqual([1]);
  });

  it('returns public and player-private events for the recipient', () => {
    const viewer = resolveViewerContext(state.players, privateRecipient.playerId);
    const visible = filterVisibleEvents(events, viewer);
    expect(visible.map((event) => event.seq)).toEqual([1, 3]);
  });

  it('returns wolf chat for werewolves', () => {
    const viewer = resolveViewerContext(state.players, wolf.playerId);
    const visible = filterVisibleEvents(events, viewer);
    expect(visible.map((event) => event.seq)).toEqual([1, 2]);
  });

  it('returns all events for spoiler viewers', () => {
    const viewer = resolveViewerContext(state.players, undefined, true);
    const visible = filterVisibleEvents(events, viewer);
    expect(visible.map((event) => event.seq)).toEqual([1, 2, 3]);
  });
});

describe('buildMatchStateView', () => {
  it('hides live roles and omits viewer data for spectators', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.players[0].alive = false;
    state.players[0].revealedRole = true;

    const view = buildMatchStateView({
      matchId: 'match:1',
      state,
      recentPublicMessages: [],
    });

    expect(view.you).toBeNull();
    const dead = view.players.find((player) => player.playerId === state.players[0].playerId);
    expect(dead?.revealedRole).toBe(state.players[0].role);
    const alive = view.players.find((player) => player.playerId === state.players[1].playerId);
    expect(alive?.revealedRole).toBeNull();
  });

  it('reveals all roles when spoilers are enabled', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    const targetPlayer = state.players[2];

    const view = buildMatchStateView({
      matchId: 'match:spoiler',
      state,
      recentPublicMessages: [],
      includeSpoilers: true,
    });

    const visible = view.players.find((player) => player.playerId === targetPlayer.playerId);
    expect(visible?.revealedRole).toBe(targetPlayer.role);
    expect(view.you).toBeNull();
  });

  it('exposes known wolves only to werewolves', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    const wolves = state.players.filter((player) => player.role === 'WEREWOLF');
    if (wolves.length === 0) {
      throw new Error('Expected werewolves in the match');
    }
    const villager = state.players.find((player) => player.role === 'VILLAGER');
    if (!villager) {
      throw new Error('Expected a villager in the match');
    }

    const wolfView = buildMatchStateView({
      matchId: 'match:2',
      state,
      viewerPlayerId: wolves[0].playerId,
      recentPublicMessages: [],
    });
    expect(wolfView.you?.knownWolves).toEqual(wolves.map((player) => player.playerId));

    const villagerView = buildMatchStateView({
      matchId: 'match:2',
      state,
      viewerPlayerId: villager.playerId,
      recentPublicMessages: [],
    });
    expect(villagerView.you?.knownWolves).toEqual([]);
  });
});

describe('isMatchActive', () => {
  const baseMatch: Doc<'werewolfMatches'> = {
    _id: 'match:1' as Id<'werewolfMatches'>,
    _creationTime: 0,
    worldId: 'world:1' as Id<'worlds'>,
    queueId: 'werewolf-default',
    buildingInstanceId: 'building:1',
    phase: 'LOBBY',
    dayNumber: 0,
    nightNumber: 1,
    phaseStartedAt: 0,
    phaseEndsAt: 10_000,
    playersAlive: 8,
    startedAt: 0,
    publicSummary: '',
  };

  it('returns true for active matches', () => {
    expect(isMatchActive(baseMatch)).toBe(true);
  });

  it('returns false when phase is ENDED', () => {
    expect(isMatchActive({ ...baseMatch, phase: 'ENDED' })).toBe(false);
  });

  it('returns false when endedAt is set', () => {
    expect(isMatchActive({ ...baseMatch, endedAt: 1_234 })).toBe(false);
  });
});
