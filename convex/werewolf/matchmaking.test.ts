import type { SerializedWorldMap } from '../aiTown/worldMap';
import { planMatchCreation, selectBuildingLocation } from './matchmaking';

type QueueEntry = {
  playerId: string;
  displayName: string;
  joinedAt: number;
};

function buildLayer(width: number, height: number, value: number): number[][] {
  return Array.from({ length: width }, () => Array.from({ length: height }, () => value));
}

function buildWorldMap(width: number, height: number): SerializedWorldMap {
  return {
    width,
    height,
    tileSetUrl: 'test-tileset',
    tileSetDimX: width,
    tileSetDimY: height,
    tileDim: 1,
    bgTiles: [buildLayer(width, height, 0)],
    objectTiles: [buildLayer(width, height, -1)],
    animatedSprites: [],
  };
}

describe('planMatchCreation', () => {
  it('returns null when fewer than required players are queued', () => {
    const map = buildWorldMap(4, 4);
    const entries: QueueEntry[] = Array.from({ length: 7 }, (_, index) => ({
      playerId: `p:${index + 1}`,
      displayName: `Player ${index + 1}`,
      joinedAt: index + 1,
    }));

    const result = planMatchCreation({
      queueId: 'werewolf-default',
      entries,
      now: 1_700_000_000_000,
      worldMap: map,
      requiredPlayers: 8,
    });

    expect(result).toBeNull();
  });

  it('orders players by join time and assigns seats in that order', () => {
    const map = buildWorldMap(6, 6);
    const entries: QueueEntry[] = [
      { playerId: 'p:1', displayName: 'One', joinedAt: 300 },
      { playerId: 'p:2', displayName: 'Two', joinedAt: 100 },
      { playerId: 'p:3', displayName: 'Three', joinedAt: 200 },
      { playerId: 'p:4', displayName: 'Four', joinedAt: 100 },
      { playerId: 'p:5', displayName: 'Five', joinedAt: 400 },
      { playerId: 'p:6', displayName: 'Six', joinedAt: 250 },
      { playerId: 'p:7', displayName: 'Seven', joinedAt: 500 },
      { playerId: 'p:8', displayName: 'Eight', joinedAt: 600 },
    ];

    const result = planMatchCreation({
      queueId: 'werewolf-default',
      entries,
      now: 1_700_000_000_123,
      worldMap: map,
      requiredPlayers: 8,
    });

    if (!result) {
      throw new Error('Expected match plan to be created');
    }

    expect(result.selectedEntries.map((entry) => entry.playerId)).toEqual([
      'p:2',
      'p:4',
      'p:3',
      'p:6',
      'p:1',
      'p:5',
      'p:7',
      'p:8',
    ]);

    expect(result.matchState.players.map((player) => player.playerId)).toEqual([
      'p:2',
      'p:4',
      'p:3',
      'p:6',
      'p:1',
      'p:5',
      'p:7',
      'p:8',
    ]);

    expect(result.matchState.players.map((player) => player.seat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('selectBuildingLocation', () => {
  it('returns the only unblocked tile', () => {
    const map = buildWorldMap(3, 2);
    const layer = map.objectTiles[0];
    for (const column of layer) {
      column.fill(0);
    }
    layer[2][1] = -1;

    const location = selectBuildingLocation(map, 'seed:only-open', []);

    expect(location).toEqual({ x: 2, y: 1 });
  });
});
