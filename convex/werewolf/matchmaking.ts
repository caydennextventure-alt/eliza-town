import type { SerializedWorldMap } from '../aiTown/worldMap';
import { xxHash32 } from '../util/xxhash';
import { createInitialMatchState } from './engine/state';
import type { MatchState } from './engine/state';

export type QueueEntrySeed = {
  playerId: string;
  displayName: string;
  joinedAt: number;
};

export type BuildingLocation = {
  x: number;
  y: number;
};

export type MatchCreationPlan = {
  selectedEntries: QueueEntrySeed[];
  matchState: MatchState;
  buildingLocation: BuildingLocation;
};

const BUILDING_PLACEMENT_SEED = 0x51f15a07;

export function planMatchCreation(params: {
  queueId: string;
  entries: QueueEntrySeed[];
  now: number;
  worldMap: SerializedWorldMap;
  requiredPlayers: number;
  occupiedPositions?: BuildingLocation[];
}): MatchCreationPlan | null {
  const sorted = [...params.entries].sort((a, b) => {
    if (a.joinedAt !== b.joinedAt) {
      return a.joinedAt - b.joinedAt;
    }
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });

  if (sorted.length < params.requiredPlayers) {
    return null;
  }

  const selectedEntries = sorted.slice(0, params.requiredPlayers);
  const matchState = createInitialMatchState(
    selectedEntries.map((entry) => ({
      playerId: entry.playerId,
      displayName: entry.displayName,
    })),
    params.now,
  );

  const placementSeed = `${params.queueId}:${params.now}:${selectedEntries
    .map((entry) => entry.playerId)
    .join('|')}`;
  const buildingLocation = selectBuildingLocation(
    params.worldMap,
    placementSeed,
    params.occupiedPositions ?? [],
  );

  return { selectedEntries, matchState, buildingLocation };
}

export function selectBuildingLocation(
  worldMap: SerializedWorldMap,
  seed: string,
  occupiedPositions: BuildingLocation[] = [],
): BuildingLocation {
  const width = Math.floor(worldMap.width);
  const height = Math.floor(worldMap.height);
  if (width <= 0 || height <= 0) {
    throw new Error('World map dimensions are invalid');
  }

  const totalTiles = width * height;
  const startIndex = (xxHash32(seed, BUILDING_PLACEMENT_SEED) >>> 0) % totalTiles;
  const occupied = new Set(occupiedPositions.map((pos) => `${pos.x},${pos.y}`));

  for (let offset = 0; offset < totalTiles; offset += 1) {
    const index = (startIndex + offset) % totalTiles;
    const x = index % width;
    const y = Math.floor(index / width);
    if (occupied.has(`${x},${y}`)) {
      continue;
    }
    if (isTileBlocked(worldMap, x, y)) {
      continue;
    }
    return { x, y };
  }

  throw new Error('No open tile available for a werewolf match building');
}

function isTileBlocked(worldMap: SerializedWorldMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= worldMap.width || y >= worldMap.height) {
    return true;
  }
  for (const layer of worldMap.objectTiles) {
    const column = layer[x];
    if (!column) {
      throw new Error(`World map object tiles missing column ${x}`);
    }
    if (column[y] === undefined) {
      throw new Error(`World map object tiles missing row ${y}`);
    }
    if (column[y] !== -1) {
      return true;
    }
  }
  return false;
}
