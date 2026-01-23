import { PixiComponent, applyDefaultProps } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { AnimatedSprite, WorldMap } from '../../convex/aiTown/worldMap';
import * as campfire from '../../data/animations/campfire.json';
import * as gentlesparkle from '../../data/animations/gentlesparkle.json';
import * as gentlewaterfall from '../../data/animations/gentlewaterfall.json';
import * as gentlesplash from '../../data/animations/gentlesplash.json';
import * as windmill from '../../data/animations/windmill.json';

const animations = {
  'campfire.json': { spritesheet: campfire, url: '/ai-town/assets/spritesheets/campfire.png' },
  'gentlesparkle.json': {
    spritesheet: gentlesparkle,
    url: '/ai-town/assets/spritesheets/gentlesparkle32.png',
  },
  'gentlewaterfall.json': {
    spritesheet: gentlewaterfall,
    url: '/ai-town/assets/spritesheets/gentlewaterfall32.png',
  },
  'windmill.json': { spritesheet: windmill, url: '/ai-town/assets/spritesheets/windmill.png' },
  'gentlesplash.json': { spritesheet: gentlesplash,
    url: '/ai-town/assets/spritesheets/gentlewaterfall32.png',},
};

type AssetsManifest = {
  basePath?: string;
  objects?: Array<{
    id: string;
    name?: string;
    image: string;
    pixelWidth?: number;
    pixelHeight?: number;
    anchor?: 'top-left' | 'bottom-left';
    category?: string;
    scale?: number;
  }>;
};

const ASSETS_JSON_PATH = 'assets/assets.json';
const DECAL_SHEET_PATH = 'assets/Tileset Asset/terrain_decals_pack_32/sheet/decals_sheet.png';
const DECAL_SHEET_JSON_PATH = 'assets/Tileset Asset/terrain_decals_pack_32/sheet/decals_sheet.json';
const TILESET_BASE_URL = import.meta.env.BASE_URL ?? '/';
const TILESET_BASE_PATH = TILESET_BASE_URL.endsWith('/') ? TILESET_BASE_URL : `${TILESET_BASE_URL}/`;

const resolveAssetPath = (path: string) => {
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `${TILESET_BASE_PATH}${encodeURI(path)}`;
};

let cachedAssetsManifest: AssetsManifest | null = null;
let assetsManifestPromise: Promise<AssetsManifest | null> | null = null;

type DecalSheet = {
  baseTexture: PIXI.BaseTexture;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
  tileSize: number;
  width: number;
  height: number;
};

let cachedDecalSheet: DecalSheet | null = null;
let decalSheetPromise: Promise<DecalSheet | null> | null = null;

const loadAssetsManifest = async (): Promise<AssetsManifest | null> => {
  if (cachedAssetsManifest) return cachedAssetsManifest;
  if (assetsManifestPromise) return assetsManifestPromise;
  assetsManifestPromise = (async () => {
    try {
      const response = await fetch(resolveAssetPath(ASSETS_JSON_PATH), { cache: 'no-store' });
      if (!response.ok) return null;
      const data = (await response.json()) as AssetsManifest;
      cachedAssetsManifest = data;
      return data;
    } catch (error) {
      console.warn('Failed to load assets manifest:', error);
      return null;
    }
  })();
  return assetsManifestPromise;
};

const loadDecalSheet = async (): Promise<DecalSheet | null> => {
  if (cachedDecalSheet) return cachedDecalSheet;
  if (decalSheetPromise) return decalSheetPromise;
  decalSheetPromise = (async () => {
    try {
      const response = await fetch(resolveAssetPath(DECAL_SHEET_JSON_PATH), { cache: 'no-store' });
      if (!response.ok) return null;
      const data = (await response.json()) as {
        tileSize?: number;
        frames?: Record<string, { x: number; y: number; w: number; h: number }>;
      };
      const frames = data.frames ?? {};
      const tileSize = Number(data.tileSize) || 32;
      let maxX = 0;
      let maxY = 0;
      for (const frame of Object.values(frames)) {
        maxX = Math.max(maxX, frame.x + frame.w);
        maxY = Math.max(maxY, frame.y + frame.h);
      }
      const baseTexture = PIXI.BaseTexture.from(resolveAssetPath(DECAL_SHEET_PATH), {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      });
      cachedDecalSheet = { baseTexture, frames, tileSize, width: maxX, height: maxY };
      return cachedDecalSheet;
    } catch (error) {
      console.warn('Failed to load decal sheet:', error);
      return null;
    }
  })();
  return decalSheetPromise;
};

const normalizeRotation = (rotation: number | undefined) => {
  const normalized = ((rotation ?? 0) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
};

const stableHash = (x: number, y: number, seed: number) => {
  let hash = (x * 73856093) ^ (y * 19349663) ^ (seed * 83492791);
  hash >>>= 0;
  return hash;
};

const pickVariantIndex = (x: number, y: number, seed: number, count: number) => {
  if (count <= 0) return 0;
  return stableHash(x, y, seed) % count;
};

const buildDecalVariantCounts = (frames: Record<string, { x: number; y: number; w: number; h: number }>) => {
  const counts: Record<string, number> = {};
  for (const key of Object.keys(frames)) {
    const match = key.match(/^(.*)_([0-9]+)$/);
    if (!match) continue;
    const prefix = match[1];
    const index = Number(match[2]);
    if (Number.isNaN(index)) continue;
    counts[prefix] = Math.max(counts[prefix] ?? 0, index + 1);
  }
  return counts;
};

const getRotatedSize = (width: number, height: number, rotation: number) =>
  rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };

const getRotationOffset = (width: number, height: number, rotation: number) => {
  if (rotation === 90) return { x: 0, y: width, angle: Math.PI / 2 };
  if (rotation === 180) return { x: width, y: height, angle: Math.PI };
  if (rotation === 270) return { x: height, y: 0, angle: Math.PI * 1.5 };
  return { x: 0, y: 0, angle: 0 };
};

export const PixiStaticMap = PixiComponent('StaticMap', {
  create: (props: { map: WorldMap; [k: string]: any }) => {
    const map = props.map;
    const numxtiles = Math.floor(map.tileSetDimX / map.tileDim);
    const numytiles = Math.floor(map.tileSetDimY / map.tileDim);
    const bt = PIXI.BaseTexture.from(map.tileSetUrl, {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
    });

    const tiles = [];
    for (let x = 0; x < numxtiles; x++) {
      for (let y = 0; y < numytiles; y++) {
        tiles[x + y * numxtiles] = new PIXI.Texture(
          bt,
          new PIXI.Rectangle(x * map.tileDim, y * map.tileDim, map.tileDim, map.tileDim),
        );
      }
    }
    const screenxtiles = map.bgTiles[0].length;
    const screenytiles = map.bgTiles[0][0].length;

    const container = new PIXI.Container();
    const groundObjectsContainer = new PIXI.Container();
    const decalsContainer = new PIXI.Container();
    const standingObjectsContainer = new PIXI.Container();
    const animatedContainer = new PIXI.Container();
    const allLayers = [...map.bgTiles, ...map.objectTiles];

    // blit bg & object layers of map onto canvas
    for (let i = 0; i < screenxtiles * screenytiles; i++) {
      const x = i % screenxtiles;
      const y = Math.floor(i / screenxtiles);
      const xPx = x * map.tileDim;
      const yPx = y * map.tileDim;

      // Add all layers of backgrounds.
      for (const layer of allLayers) {
        const tileIndex = layer[x][y];
        // Some layers may not have tiles at this location.
        if (tileIndex === -1) continue;
        const ctile = new PIXI.Sprite(tiles[tileIndex]);
        ctile.x = xPx;
        ctile.y = yPx;
        container.addChild(ctile);
      }
    }

    container.addChild(groundObjectsContainer);
    container.addChild(decalsContainer);
    container.addChild(standingObjectsContainer);
    container.addChild(animatedContainer);

    const placedObjects = map.placedObjects ?? [];
    const terrainDecals = map.terrainDecals;

    if (terrainDecals && placedObjects.length > 0) {
      const mapWidth = screenxtiles;
      const mapHeight = screenytiles;
      const grid: number[][] = Array.from({ length: mapWidth }, () => Array.from({ length: mapHeight }, () => 0));
      for (const placement of placedObjects) {
        if (placement.col < 0 || placement.row < 0 || placement.col >= mapWidth || placement.row >= mapHeight) continue;
        if (placement.objectId === terrainDecals.grassId) {
          grid[placement.col][placement.row] = 1;
        } else if (placement.objectId === terrainDecals.sandId) {
          grid[placement.col][placement.row] = 2;
        }
      }

      const decalRequests: Array<{ col: number; row: number; prefix: string; seed: number }> = [];

      for (let col = 0; col < mapWidth; col += 1) {
        for (let row = 0; row < mapHeight; row += 1) {
          if (grid[col][row] !== 2) continue;
          const north = row > 0 ? grid[col][row - 1] : 0;
          const south = row < mapHeight - 1 ? grid[col][row + 1] : 0;
          const west = col > 0 ? grid[col - 1][row] : 0;
          const east = col < mapWidth - 1 ? grid[col + 1][row] : 0;

          if (north === 1) decalRequests.push({ col, row, prefix: 'grass_in_sand_N', seed: 1 });
          if (east === 1) decalRequests.push({ col, row, prefix: 'grass_in_sand_E', seed: 2 });
          if (south === 1) decalRequests.push({ col, row, prefix: 'grass_in_sand_S', seed: 3 });
          if (west === 1) decalRequests.push({ col, row, prefix: 'grass_in_sand_W', seed: 4 });

          if (north === 1 && east === 1) decalRequests.push({ col, row, prefix: 'grass_in_sand_corner_NE', seed: 5 });
          if (north === 1 && west === 1) decalRequests.push({ col, row, prefix: 'grass_in_sand_corner_NW', seed: 6 });
          if (south === 1 && east === 1) decalRequests.push({ col, row, prefix: 'grass_in_sand_corner_SE', seed: 7 });
          if (south === 1 && west === 1) decalRequests.push({ col, row, prefix: 'grass_in_sand_corner_SW', seed: 8 });

          const nearGrass = north === 1 || south === 1 || east === 1 || west === 1;
          if (nearGrass) {
            const roll = stableHash(col, row, 9) % 100;
            if (roll < 18) {
              decalRequests.push({ col, row, prefix: 'grass_tuft', seed: 10 });
            }
          }
        }
      }

      if (decalRequests.length > 0) {
        void loadDecalSheet().then((sheet) => {
          if (!sheet) return;
          const variantCounts = buildDecalVariantCounts(sheet.frames);
          const scale = map.tileDim / sheet.tileSize;
          for (const request of decalRequests) {
            const count = variantCounts[request.prefix] ?? 0;
            if (count <= 0) continue;
            const index = pickVariantIndex(request.col, request.row, request.seed, count);
            const key = `${request.prefix}_${index}`;
            const frame = sheet.frames[key];
            if (!frame) continue;
            const texture = new PIXI.Texture(
              sheet.baseTexture,
              new PIXI.Rectangle(frame.x, frame.y, frame.w, frame.h),
            );
            const sprite = new PIXI.Sprite(texture);
            sprite.x = request.col * map.tileDim;
            sprite.y = request.row * map.tileDim;
            if (scale !== 1) {
              sprite.scale.set(scale);
            }
            decalsContainer.addChild(sprite);
          }
        });
      }
    }
    if (placedObjects.length > 0) {
      void loadAssetsManifest().then((assets) => {
        if (!assets?.objects || assets.objects.length === 0) return;
        const objectsById = new Map(assets.objects.map((obj) => [obj.id, obj]));

        const getObjectTileSize = (object: NonNullable<AssetsManifest['objects']>[number], rotation: number) => {
          const pixelWidth = Number(object.pixelWidth) || map.tileDim;
          const pixelHeight = Number(object.pixelHeight) || map.tileDim;
          const isGround =
            object.category === 'terrain' ||
            object.category === 'paths' ||
            object.category === 'tile-object';
          const baseTileWidth = isGround ? 1 : Math.max(1, Math.ceil(pixelWidth / map.tileDim));
          const baseTileHeight = isGround ? 1 : Math.max(1, Math.ceil(pixelHeight / map.tileDim));
          const rotated = rotation === 90 || rotation === 270;
          return {
            tileWidth: rotated ? baseTileHeight : baseTileWidth,
            tileHeight: rotated ? baseTileWidth : baseTileHeight,
          };
        };

        const getObjectAnchorOffset = (object: NonNullable<AssetsManifest['objects']>[number], rotation: number) => {
          const { tileHeight } = getObjectTileSize(object, rotation);
          if (object.anchor === 'bottom-left') {
            return { x: 0, y: tileHeight - 1 };
          }
          return { x: 0, y: 0 };
        };

        const sorted = [...placedObjects].sort((a, b) => {
          const aDef = objectsById.get(a.objectId);
          const bDef = objectsById.get(b.objectId);
          if (!aDef || !bDef) return 0;
          const aGround =
            aDef.category === 'terrain' ||
            aDef.category === 'paths' ||
            aDef.category === 'tile-object';
          const bGround =
            bDef.category === 'terrain' ||
            bDef.category === 'paths' ||
            bDef.category === 'tile-object';
          if (aGround !== bGround) return aGround ? -1 : 1;
          const aRotation = normalizeRotation(a.rotation);
          const bRotation = normalizeRotation(b.rotation);
          const aSize = getObjectTileSize(aDef, aRotation);
          const bSize = getObjectTileSize(bDef, bRotation);
          const aAnchor = getObjectAnchorOffset(aDef, aRotation);
          const bAnchor = getObjectAnchorOffset(bDef, bRotation);
          const aEndRow = (a.row - aAnchor.y) + aSize.tileHeight - 1;
          const bEndRow = (b.row - bAnchor.y) + bSize.tileHeight - 1;
          if (aEndRow !== bEndRow) return aEndRow - bEndRow;
          return a.col - b.col;
        });

        for (const placement of sorted) {
          const def = objectsById.get(placement.objectId);
          if (!def) continue;
          if (!def.image) continue;
          const rotation = normalizeRotation(placement.rotation);
          const pixelWidth = Number(def.pixelWidth) || map.tileDim;
          const pixelHeight = Number(def.pixelHeight) || map.tileDim;
          const isGround =
            def.category === 'terrain' ||
            def.category === 'paths' ||
            def.category === 'tile-object';

          const { tileWidth, tileHeight } = getObjectTileSize(def, rotation);
          const anchor = getObjectAnchorOffset(def, rotation);
          const startCol = placement.col - anchor.x;
          const startRow = placement.row - anchor.y;
          const boundsHeight = tileHeight * map.tileDim;

          const baseWidth = isGround ? map.tileDim : pixelWidth;
          const baseHeight = isGround ? map.tileDim : pixelHeight;
          const rotatedSize = getRotatedSize(baseWidth, baseHeight, rotation);
          const offsetY = isGround || def.anchor !== 'bottom-left'
            ? 0
            : Math.max(0, boundsHeight - rotatedSize.height);

          const holder = new PIXI.Container();
          holder.x = startCol * map.tileDim;
          holder.y = startRow * map.tileDim + offsetY;

          const texture = PIXI.Texture.from(resolveAssetPath(def.image));
          texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
          const sprite = new PIXI.Sprite(texture);
          sprite.width = baseWidth;
          sprite.height = baseHeight;

          const rotationInfo = getRotationOffset(baseWidth, baseHeight, rotation);
          sprite.x = rotationInfo.x;
          sprite.y = rotationInfo.y;
          sprite.rotation = rotationInfo.angle;

          holder.addChild(sprite);
          if (isGround) {
            groundObjectsContainer.addChild(holder);
          } else {
            standingObjectsContainer.addChild(holder);
          }
        }
      });
    }

    // TODO: Add layers.
    const spritesBySheet = new Map<string, AnimatedSprite[]>();
    for (const sprite of map.animatedSprites) {
      const sheet = sprite.sheet;
      if (!spritesBySheet.has(sheet)) {
        spritesBySheet.set(sheet, []);
      }
      spritesBySheet.get(sheet)!.push(sprite);
    }
    for (const [sheet, sprites] of spritesBySheet.entries()) {
      const animation = (animations as any)[sheet];
      if (!animation) {
        console.error('Could not find animation', sheet);
        continue;
      }
      const { spritesheet, url } = animation;
      const texture = PIXI.BaseTexture.from(url, {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      });
      const spriteSheet = new PIXI.Spritesheet(texture, spritesheet);
      spriteSheet.parse().then(() => {
        for (const sprite of sprites) {
          const pixiAnimation = spriteSheet.animations[sprite.animation];
          if (!pixiAnimation) {
            console.error('Failed to load animation', sprite);
            continue;
          }
          const pixiSprite = new PIXI.AnimatedSprite(pixiAnimation);
          pixiSprite.animationSpeed = 0.1;
          pixiSprite.autoUpdate = true;
          pixiSprite.x = sprite.x;
          pixiSprite.y = sprite.y;
          pixiSprite.width = sprite.w;
          pixiSprite.height = sprite.h;
          animatedContainer.addChild(pixiSprite);
          pixiSprite.play();
        }
      });
    }

    container.x = 0;
    container.y = 0;

    // Set the hit area manually to ensure `pointerdown` events are delivered to this container.
    container.interactive = true;
    container.hitArea = new PIXI.Rectangle(
      0,
      0,
      screenxtiles * map.tileDim,
      screenytiles * map.tileDim,
    );

    return container;
  },

  applyProps: (instance, oldProps, newProps) => {
    applyDefaultProps(instance, oldProps, newProps);
  },
});
