import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { mutation } from './_generated/server';
import { createEngine } from './aiTown/main';
import { ENGINE_ACTION_DURATION } from './constants';
import { getOptionalUserId } from './util/auth';
import roomJson from '../data/room.json';

function allowUnauthenticatedRooms(): boolean {
  return process.env.ALLOW_UNAUTHENTICATED_TOWN_EDIT === '1';
}

function getRoomOwnerKey(userId: string | null, guestKey: string | undefined): string {
  if (userId) return `user:${userId}`;

  if (!allowUnauthenticatedRooms()) {
    throw new ConvexError('Not logged in');
  }

  const trimmed = guestKey?.trim();
  if (!trimmed) {
    throw new ConvexError('Missing guestKey');
  }
  if (trimmed.length > 128) {
    throw new ConvexError('guestKey too long');
  }
  return `guest:${trimmed}`;
}

const TILESET_1PX_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgCj2R1kAAAAASUVORK5CYII=';

const TILE_DIM = 32;

function createBlankLayer(width: number, height: number, fill: number): number[][] {
  return Array.from({ length: width }, () => Array.from({ length: height }, () => fill));
}

function toColumnMajorLayer(width: number, height: number, flat: number[], mapFn: (v: number) => number) {
  const layer = createBlankLayer(width, height, -1);
  const expected = width * height;
  for (let i = 0; i < expected; i += 1) {
    const x = i % width;
    const y = Math.floor(i / width);
    layer[x]![y] = mapFn(flat[i] ?? 0);
  }
  return layer;
}

function buildPlacedFloorFromTerrain(
  width: number,
  height: number,
  terrain: number[],
  collision: number[],
) {
  const placedObjects: Array<{
    id: string;
    objectId: string;
    col: number;
    row: number;
    rotation?: number;
  }> = [];

  const floorA = 'wooden-path-1';
  const floorB = 'dark-wooden-path-1';

  const expected = width * height;
  for (let i = 0; i < expected; i += 1) {
    const x = i % width;
    const y = Math.floor(i / width);
    const t = terrain[i] ?? 0;
    const isBlocked = (collision[i] ?? 0) === 1;

    // Always paint floor, even under blocked tiles, so the room doesn't have holes.
    const objectId = t === 1 ? floorB : floorA;
    placedObjects.push({
      id: `floor-${x}-${y}`,
      objectId,
      col: x,
      row: y,
      rotation: 0,
    });

    // Optional: if you want visible walls later, generate wall/fence objects here
    // based on isBlocked + neighbor masks. For MVP we keep walls collision-only.
    void isBlocked;
  }

  return placedObjects;
}

function getRoomLayersFromRoomJson(json: any): {
  bgTiles: number[][][];
  encodedTileSets?: Array<{ url: string; cols: number; tileSize: number; firstId: number }>;
} | null {
  const width = Number(json?.width);
  const height = Number(json?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const backLayer = Array.isArray(json?.backLayer) ? (json.backLayer as number[]) : null;
  const buildingsLayer = Array.isArray(json?.buildingsLayer) ? (json.buildingsLayer as number[]) : null;
  const frontLayer = Array.isArray(json?.frontLayer) ? (json.frontLayer as number[]) : null;
  if (!backLayer || !buildingsLayer || !frontLayer) {
    return null;
  }
  if (backLayer.length !== width * height || buildingsLayer.length !== width * height || frontLayer.length !== width * height) {
    return null;
  }

  const toLayer = (flat: number[]) => toColumnMajorLayer(width, height, flat, (v) => Number(v) || 0);
  const bgTiles = [toLayer(backLayer), toLayer(buildingsLayer), toLayer(frontLayer)];
  const encodedTileSets = [
    { url: 'assets/interior/walls_and_floors.png', cols: 16, tileSize: 16, firstId: 1 },
    { url: 'assets/interior/townInterior.png', cols: 32, tileSize: 16, firstId: 1000 },
  ];
  return { bgTiles, encodedTileSets };
}

export const getOrCreateMyRoomWorld = mutation({
  args: {
    guestKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getOptionalUserId(ctx);
    const ownerKey = getRoomOwnerKey(userId, args.guestKey);

    const existing = await ctx.db
      .query('userRooms')
      .withIndex('by_ownerKey', (q) => q.eq('ownerKey', ownerKey))
      .unique();
    if (existing) {
      // Auto-upgrade early room seeds that painted the whole floor with placedObjects,
      // hiding the roomJson bgTiles.
      const map = await ctx.db
        .query('maps')
        .withIndex('worldId', (q) => q.eq('worldId', existing.worldId))
        .unique();
      const roomLayers = getRoomLayersFromRoomJson(roomJson as any);
      if (map && roomLayers) {
        const width = Number((map as any).width);
        const height = Number((map as any).height);
        const placedObjects = Array.isArray((map as any).placedObjects) ? ((map as any).placedObjects as any[]) : [];
        const hasSeededFloors = placedObjects.some(
          (o) => typeof o?.id === 'string' && o.id.startsWith('floor-'),
        );
        const shouldPatch =
          hasSeededFloors ||
          !(map as any).encodedTileSets ||
          !Array.isArray((map as any).bgTiles) ||
          (map as any).bgTiles.length < 3;
        if (shouldPatch) {
          const filteredPlaced = placedObjects.filter(
            (o) => !(typeof o?.id === 'string' && o.id.startsWith('floor-')),
          );

          // Collision tiles should be non-rendering; normalize to 0/-1 (0 blocks movement).
          const objectTiles = Array.isArray((map as any).objectTiles) ? ((map as any).objectTiles as any[]) : [];
          let patchedObjectTiles = objectTiles;
          if (
            objectTiles.length === 1 &&
            Number.isFinite(width) &&
            Number.isFinite(height) &&
            width > 0 &&
            height > 0
          ) {
            const layer0 = objectTiles[0];
            if (Array.isArray(layer0) && Array.isArray(layer0[0])) {
              patchedObjectTiles = [
                Array.from({ length: width }, (_, x) =>
                  Array.from({ length: height }, (_, y) => ((layer0?.[x]?.[y] ?? -1) === -1 ? -1 : 0)),
                ),
              ];
            }
          }

          await ctx.db.patch(map._id, {
            bgTiles: roomLayers.bgTiles,
            encodedTileSets: roomLayers.encodedTileSets,
            placedObjects: filteredPlaced,
            objectTiles: patchedObjectTiles,
          });
        }
      }
      return { worldId: existing.worldId };
    }

    const now = Date.now();
    const engineId = await createEngine(ctx);
    const engine = await ctx.db.get(engineId);
    if (!engine) {
      throw new ConvexError('Engine creation failed');
    }

    const worldId = await ctx.db.insert('worlds', {
      nextId: 0,
      agents: [],
      conversations: [],
      players: [],
    });

    await ctx.db.insert('worldStatus', {
      engineId,
      isDefault: false,
      lastViewed: now,
      status: 'running',
      worldId,
    });

    const width = Number((roomJson as any).width);
    const height = Number((roomJson as any).height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new ConvexError('Invalid room.json dimensions');
    }
    const terrain = Array.isArray((roomJson as any).terrain) ? ((roomJson as any).terrain as number[]) : [];
    const collision = Array.isArray((roomJson as any).collision) ? ((roomJson as any).collision as number[]) : [];
    if (terrain.length !== width * height || collision.length !== width * height) {
      throw new ConvexError('room.json terrain/collision size mismatch');
    }

    // Use 0 (not -1) to block movement while staying invisible in encoded-tile rendering.
    const collisionLayer = toColumnMajorLayer(width, height, collision, (v) => (v === 1 ? 0 : -1));
    const roomLayers = getRoomLayersFromRoomJson(roomJson as any);
    const floorPlacedObjects = roomLayers ? [] : buildPlacedFloorFromTerrain(width, height, terrain, collision);

    await ctx.db.insert('maps', {
      worldId,
      width,
      height,
      tileSetUrl: TILESET_1PX_PNG,
      tileSetDimX: TILE_DIM,
      tileSetDimY: TILE_DIM,
      tileDim: TILE_DIM,
      bgTiles: roomLayers?.bgTiles ?? [createBlankLayer(width, height, -1)],
      // Layer 0 is collision. (Keep as invisible tile indices.)
      objectTiles: [collisionLayer],
      placedObjects: floorPlacedObjects,
      interactables: [],
      encodedTileSets: roomLayers?.encodedTileSets,
      terrainDecals: undefined,
      animatedSprites: [],
    });

    await ctx.db.insert('userRooms', { ownerKey, worldId, createdAt: now });

    await ctx.scheduler.runAfter(0, internal.aiTown.main.runStep, {
      worldId,
      generationNumber: engine.generationNumber,
      maxDuration: ENGINE_ACTION_DURATION,
    });

    return { worldId };
  },
});
