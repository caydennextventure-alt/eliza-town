import { Infer, ObjectType, v } from 'convex/values';

// `layer[position.x][position.y]` is the tileIndex or -1 if empty.
const tileLayer = v.array(v.array(v.number()));
export type TileLayer = Infer<typeof tileLayer>;

const animatedSprite = {
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  layer: v.number(),
  sheet: v.string(),
  animation: v.string(),
};
export type AnimatedSprite = ObjectType<typeof animatedSprite>;

const placedObject = {
  id: v.string(),
  objectId: v.string(),
  col: v.number(),
  row: v.number(),
  rotation: v.optional(v.number()),
  pixelOffsetX: v.optional(v.number()),
  pixelOffsetY: v.optional(v.number()),
};
export type PlacedObject = ObjectType<typeof placedObject>;

export const serializedWorldMap = {
  width: v.number(),
  height: v.number(),

  tileSetUrl: v.string(),
  //  Width & height of tileset image, px.
  tileSetDimX: v.number(),
  tileSetDimY: v.number(),

  // Tile size in pixels (assume square)
  tileDim: v.number(),
  bgTiles: v.array(v.array(v.array(v.number()))),
  objectTiles: v.array(tileLayer),
  placedObjects: v.optional(v.array(v.object(placedObject))),
  terrainDecals: v.optional(
    v.object({
      grassId: v.string(),
      sandId: v.string(),
      waterId: v.optional(v.string()),
    }),
  ),
  animatedSprites: v.array(v.object(animatedSprite)),
};
export type SerializedWorldMap = ObjectType<typeof serializedWorldMap>;

export class WorldMap {
  width: number;
  height: number;

  tileSetUrl: string;
  tileSetDimX: number;
  tileSetDimY: number;

  tileDim: number;

  bgTiles: TileLayer[];
  objectTiles: TileLayer[];
  placedObjects: PlacedObject[];
  terrainDecals?: { grassId: string; sandId: string; waterId?: string };
  animatedSprites: AnimatedSprite[];

  constructor(serialized: SerializedWorldMap) {
    this.width = serialized.width;
    this.height = serialized.height;
    this.tileSetUrl = serialized.tileSetUrl;
    this.tileSetDimX = serialized.tileSetDimX;
    this.tileSetDimY = serialized.tileSetDimY;
    this.tileDim = serialized.tileDim;
    this.bgTiles = serialized.bgTiles;
    this.objectTiles = serialized.objectTiles;
    this.placedObjects = serialized.placedObjects ?? [];
    this.terrainDecals = serialized.terrainDecals ?? undefined;
    this.animatedSprites = serialized.animatedSprites;
  }

  serialize(): SerializedWorldMap {
    return {
      width: this.width,
      height: this.height,
      tileSetUrl: this.tileSetUrl,
      tileSetDimX: this.tileSetDimX,
      tileSetDimY: this.tileSetDimY,
      tileDim: this.tileDim,
      bgTiles: this.bgTiles,
      objectTiles: this.objectTiles,
      placedObjects: this.placedObjects,
      terrainDecals: this.terrainDecals,
      animatedSprites: this.animatedSprites,
    };
  }
}
