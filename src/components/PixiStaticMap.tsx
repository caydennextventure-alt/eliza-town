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
    anchor?: 'top-left' | 'bottom-left' | 'center';
    category?: string;
    scale?: number;
  }>;
};

const ASSETS_JSON_PATH = 'assets/assets.json';
const DECAL_SHEETS = {
  grassInSand: {
    png: 'assets/Tileset Asset/decals/grass_in_sand_sheet.png',
    json: 'assets/Tileset Asset/decals/grass_in_sand_sheet.json',
  },
  shoreOnSand: {
    png: 'assets/Tileset Asset/decals/shore_on_sand_sheet.png',
    json: 'assets/Tileset Asset/decals/shore_on_sand_sheet.json',
  },
  shoreOnWater: {
    png: 'assets/Tileset Asset/decals/shore_on_water_sheet.png',
    json: 'assets/Tileset Asset/decals/shore_on_water_sheet.json',
  },
} as const;

type DecalSheetKey = keyof typeof DECAL_SHEETS;
const PATH_BORDER_PACK = {
  base: 'assets/Tileset Asset/decals',
  config: 'assets/Tileset Asset/decals/path_border_rules.json',
} as const;
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

const cachedDecalSheets: Partial<Record<DecalSheetKey, DecalSheet>> = {};
const decalSheetPromises: Partial<Record<DecalSheetKey, Promise<DecalSheet | null>>> = {};

type PathBorderRule = {
  name: string;
  baseTile: string;
  sheet: string;
  sheetJson: string;
};

let cachedPathBorderRules: PathBorderRule[] | null = null;
let pathBorderRulesPromise: Promise<PathBorderRule[] | null> | null = null;
const cachedPathBorderSheets: Record<string, DecalSheet> = {};
const pathBorderSheetPromises: Record<string, Promise<DecalSheet | null>> = {};

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

const loadDecalSheet = async (key: DecalSheetKey): Promise<DecalSheet | null> => {
  if (cachedDecalSheets[key]) return cachedDecalSheets[key]!;
  if (decalSheetPromises[key]) return decalSheetPromises[key]!;
  decalSheetPromises[key] = (async () => {
    try {
      const sheet = DECAL_SHEETS[key];
      const response = await fetch(resolveAssetPath(sheet.json), { cache: 'no-store' });
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
      const baseTexture = PIXI.BaseTexture.from(resolveAssetPath(sheet.png), {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      });
      const result = { baseTexture, frames, tileSize, width: maxX, height: maxY };
      cachedDecalSheets[key] = result;
      return result;
    } catch (error) {
      console.warn('Failed to load decal sheet:', key, error);
      return null;
    }
  })();
  return decalSheetPromises[key]!;
};

const loadPathBorderRules = async (): Promise<PathBorderRule[] | null> => {
  if (cachedPathBorderRules) return cachedPathBorderRules;
  if (pathBorderRulesPromise) return pathBorderRulesPromise;
  pathBorderRulesPromise = (async () => {
    try {
      const response = await fetch(resolveAssetPath(PATH_BORDER_PACK.config), { cache: 'no-store' });
      if (!response.ok) return null;
      const data = await response.json();
      const rules = (data?.paths ?? []).map((entry: any) => ({
        name: String(entry?.name ?? ''),
        baseTile: String(entry?.baseTile ?? ''),
        sheet: String(entry?.sheet ?? ''),
        sheetJson: String(entry?.sheetJson ?? ''),
      })) as PathBorderRule[];
      cachedPathBorderRules = rules;
      return rules;
    } catch (error) {
      console.warn('Failed to load path border rules:', error);
      return null;
    }
  })();
  return pathBorderRulesPromise;
};

const loadPathBorderSheet = async (rule: PathBorderRule): Promise<DecalSheet | null> => {
  if (cachedPathBorderSheets[rule.name]) return cachedPathBorderSheets[rule.name];
  if (pathBorderSheetPromises[rule.name]) return pathBorderSheetPromises[rule.name];
  pathBorderSheetPromises[rule.name] = (async () => {
    try {
      if (!rule.sheet || !rule.sheetJson) return null;
      const jsonPath = `${PATH_BORDER_PACK.base}/${rule.sheetJson}`;
      const pngPath = `${PATH_BORDER_PACK.base}/${rule.sheet}`;
      const response = await fetch(resolveAssetPath(jsonPath), { cache: 'no-store' });
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
      const baseTexture = PIXI.BaseTexture.from(resolveAssetPath(pngPath), {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      });
      const sheet = { baseTexture, frames, tileSize, width: maxX, height: maxY };
      cachedPathBorderSheets[rule.name] = sheet;
      return sheet;
    } catch (error) {
      console.warn('Failed to load path border sheet:', rule.name, error);
      return null;
    }
  })();
  return pathBorderSheetPromises[rule.name];
};

const normalizeRotation = (rotation: number | undefined) => {
  const normalized = ((rotation ?? 0) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
};

const LEGACY_OBJECT_ID_MAP: Record<string, string> = {
  'flooring-44': 'grass',
  'asset-9': 'sand',
  'asset-10': 'sea',
};

const normalizeLegacyId = (id?: string) => (id ? LEGACY_OBJECT_ID_MAP[id] ?? id : id);

const normalizePlacedObjects = (objects: WorldMap['placedObjects']) => {
  let changed = false;
  const next = objects.map((obj) => {
    const normalized = normalizeLegacyId(obj.objectId);
    if (normalized && normalized !== obj.objectId) {
      changed = true;
      return { ...obj, objectId: normalized };
    }
    return obj;
  });
  return changed ? next : objects;
};

const normalizeTerrainDecals = (terrainDecals?: WorldMap['terrainDecals']) => {
  if (!terrainDecals) return terrainDecals;
  const grassId = normalizeLegacyId(terrainDecals.grassId) ?? terrainDecals.grassId;
  const sandId = normalizeLegacyId(terrainDecals.sandId) ?? terrainDecals.sandId;
  const waterId = terrainDecals.waterId ? normalizeLegacyId(terrainDecals.waterId) : undefined;
  if (
    grassId === terrainDecals.grassId &&
    sandId === terrainDecals.sandId &&
    waterId === terrainDecals.waterId
  ) {
    return terrainDecals;
  }
  return { grassId, sandId, waterId };
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

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const getBaseName = (value: string) => {
  const cleaned = decodeURI(value);
  const parts = cleaned.split('/');
  return parts[parts.length - 1] ?? cleaned;
};

const stripExtension = (value: string) => value.replace(/\.[^/.]+$/, '');

const isGroundCategory = (category?: string) =>
  category === 'terrain' || category === 'paths' || category === 'flooring' || category === 'tile-object';

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
    const stampObjectsContainer = new PIXI.Container();
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
    container.addChild(stampObjectsContainer);
    container.addChild(standingObjectsContainer);
    container.addChild(animatedContainer);

    const placedObjects = normalizePlacedObjects(map.placedObjects ?? []);
    const terrainDecals = normalizeTerrainDecals(map.terrainDecals);

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
        } else if (terrainDecals.waterId && placement.objectId === terrainDecals.waterId) {
          grid[placement.col][placement.row] = 3;
        }
      }

      type DecalKind =
        | 'edgeN'
        | 'edgeE'
        | 'edgeS'
        | 'edgeW'
        | 'cornerNE'
        | 'cornerNW'
        | 'cornerSE'
        | 'cornerSW'
        | 'tuft';
      const requestsBySheet = new Map<
        DecalSheetKey,
        Array<{ col: number; row: number; kind: DecalKind; seed: number; offsetX?: number; offsetY?: number }>
      >();
      const pushRequest = (
        sheet: DecalSheetKey,
        col: number,
        row: number,
        kind: DecalKind,
        seed: number,
        offsetX?: number,
        offsetY?: number,
      ) => {
        const list = requestsBySheet.get(sheet);
        if (list) {
          list.push({ col, row, kind, seed, offsetX, offsetY });
        } else {
          requestsBySheet.set(sheet, [{ col, row, kind, seed, offsetX, offsetY }]);
        }
      };

      const cornerOffset = Math.max(3, Math.round(map.tileDim * 0.2));
      const cornerSoftenChanceSand = 55;
      const cornerSoftenChanceWater = 50;

      for (let col = 0; col < mapWidth; col += 1) {
        for (let row = 0; row < mapHeight; row += 1) {
          const cell = grid[col][row];
          const north = row > 0 ? grid[col][row - 1] : 0;
          const south = row < mapHeight - 1 ? grid[col][row + 1] : 0;
          const west = col > 0 ? grid[col - 1][row] : 0;
          const east = col < mapWidth - 1 ? grid[col + 1][row] : 0;

          if (cell === 2) {
            if (north === 1) pushRequest('grassInSand', col, row, 'edgeN', 1);
            if (east === 1) pushRequest('grassInSand', col, row, 'edgeE', 2);
            if (south === 1) pushRequest('grassInSand', col, row, 'edgeS', 3);
            if (west === 1) pushRequest('grassInSand', col, row, 'edgeW', 4);

            if (north === 1 && east === 1) pushRequest('grassInSand', col, row, 'cornerNE', 5);
            if (north === 1 && west === 1) pushRequest('grassInSand', col, row, 'cornerNW', 6);
            if (south === 1 && east === 1) pushRequest('grassInSand', col, row, 'cornerSE', 7);
            if (south === 1 && west === 1) pushRequest('grassInSand', col, row, 'cornerSW', 8);

            const nearGrass = north === 1 || south === 1 || east === 1 || west === 1;
            if (nearGrass && stableHash(col, row, 9) % 100 < 18) {
              pushRequest('grassInSand', col, row, 'tuft', 10);
            }

            if (terrainDecals.waterId) {
              if (north === 3) pushRequest('shoreOnSand', col, row, 'edgeN', 11);
              if (east === 3) pushRequest('shoreOnSand', col, row, 'edgeE', 12);
              if (south === 3) pushRequest('shoreOnSand', col, row, 'edgeS', 13);
              if (west === 3) pushRequest('shoreOnSand', col, row, 'edgeW', 14);

              if (north === 3 && east === 3) pushRequest('shoreOnSand', col, row, 'cornerNE', 15);
              if (north === 3 && west === 3) pushRequest('shoreOnSand', col, row, 'cornerNW', 16);
              if (south === 3 && east === 3) pushRequest('shoreOnSand', col, row, 'cornerSE', 17);
              if (south === 3 && west === 3) pushRequest('shoreOnSand', col, row, 'cornerSW', 18);

              const nearWater = north === 3 || south === 3 || east === 3 || west === 3;
              if (nearWater && stableHash(col, row, 19) % 100 < 22) {
                pushRequest('shoreOnSand', col, row, 'tuft', 20);
              }

              const addCornerTuft = (dx: number, dy: number, seed: number) => {
                if (stableHash(col, row, seed) % 100 < cornerSoftenChanceSand) {
                  pushRequest('shoreOnSand', col, row, 'tuft', seed + 100, dx, dy);
                }
              };
              if (north === 3 && east === 3) addCornerTuft(cornerOffset, -cornerOffset, 31);
              if (north === 3 && west === 3) addCornerTuft(-cornerOffset, -cornerOffset, 32);
              if (south === 3 && east === 3) addCornerTuft(cornerOffset, cornerOffset, 33);
              if (south === 3 && west === 3) addCornerTuft(-cornerOffset, cornerOffset, 34);
            }
          }

          if (cell === 3 && terrainDecals.waterId) {
            if (north === 2) pushRequest('shoreOnWater', col, row, 'edgeN', 21);
            if (east === 2) pushRequest('shoreOnWater', col, row, 'edgeE', 22);
            if (south === 2) pushRequest('shoreOnWater', col, row, 'edgeS', 23);
            if (west === 2) pushRequest('shoreOnWater', col, row, 'edgeW', 24);

            if (north === 2 && east === 2) pushRequest('shoreOnWater', col, row, 'cornerNE', 25);
            if (north === 2 && west === 2) pushRequest('shoreOnWater', col, row, 'cornerNW', 26);
            if (south === 2 && east === 2) pushRequest('shoreOnWater', col, row, 'cornerSE', 27);
            if (south === 2 && west === 2) pushRequest('shoreOnWater', col, row, 'cornerSW', 28);

            const nearSand = north === 2 || south === 2 || east === 2 || west === 2;
            if (nearSand && stableHash(col, row, 29) % 100 < 18) {
              pushRequest('shoreOnWater', col, row, 'tuft', 30);
            }

            const addCornerTuft = (dx: number, dy: number, seed: number) => {
              if (stableHash(col, row, seed) % 100 < cornerSoftenChanceWater) {
                pushRequest('shoreOnWater', col, row, 'tuft', seed + 100, dx, dy);
              }
            };
            if (north === 2 && east === 2) addCornerTuft(cornerOffset, -cornerOffset, 41);
            if (north === 2 && west === 2) addCornerTuft(-cornerOffset, -cornerOffset, 42);
            if (south === 2 && east === 2) addCornerTuft(cornerOffset, cornerOffset, 43);
            if (south === 2 && west === 2) addCornerTuft(-cornerOffset, cornerOffset, 44);
          }
        }
      }

      if (requestsBySheet.size > 0) {
        for (const [sheetKey, requests] of requestsBySheet.entries()) {
          void loadDecalSheet(sheetKey).then((sheet) => {
            if (!sheet) return;
            const variantCounts = buildDecalVariantCounts(sheet.frames);
            const resolvePrefix = (kind: DecalKind) => {
              if (sheetKey === 'grassInSand') {
                const edgePrefix =
                  kind === 'edgeN'
                    ? variantCounts['grass_in_sand_edge_N']
                      ? 'grass_in_sand_edge_N'
                      : 'grass_in_sand_N'
                    : kind === 'edgeE'
                      ? variantCounts['grass_in_sand_edge_E']
                        ? 'grass_in_sand_edge_E'
                        : 'grass_in_sand_E'
                      : kind === 'edgeS'
                        ? variantCounts['grass_in_sand_edge_S']
                          ? 'grass_in_sand_edge_S'
                          : 'grass_in_sand_S'
                        : kind === 'edgeW'
                          ? variantCounts['grass_in_sand_edge_W']
                            ? 'grass_in_sand_edge_W'
                            : 'grass_in_sand_W'
                          : null;
                if (edgePrefix) return edgePrefix;
                if (kind === 'cornerNE') return 'grass_in_sand_corner_NE';
                if (kind === 'cornerNW') return 'grass_in_sand_corner_NW';
                if (kind === 'cornerSE') return 'grass_in_sand_corner_SE';
                if (kind === 'cornerSW') return 'grass_in_sand_corner_SW';
                if (kind === 'tuft') {
                  return variantCounts['grass_in_sand_tuft'] ? 'grass_in_sand_tuft' : 'grass_tuft';
                }
                return null;
              }
              if (sheetKey === 'shoreOnSand') {
                if (kind.startsWith('edge')) return `shore_on_sand_edge_${kind.slice(4)}`;
                if (kind.startsWith('corner')) return `shore_on_sand_corner_${kind.slice(6)}`;
                if (kind === 'tuft') return 'shore_on_sand_tuft';
                return null;
              }
              if (sheetKey === 'shoreOnWater') {
                if (kind.startsWith('edge')) return `shore_on_water_edge_${kind.slice(4)}`;
                if (kind.startsWith('corner')) return `shore_on_water_corner_${kind.slice(6)}`;
                if (kind === 'tuft') return 'shore_on_water_tuft';
                return null;
              }
              return null;
            };

            const scale = map.tileDim / sheet.tileSize;
            for (const request of requests) {
              const prefix = resolvePrefix(request.kind);
              if (!prefix) continue;
              const count = variantCounts[prefix] ?? 0;
              if (count <= 0) continue;
              const index = pickVariantIndex(request.col, request.row, request.seed, count);
              const key = `${prefix}_${index}`;
              const frame = sheet.frames[key];
              if (!frame) continue;
              const texture = new PIXI.Texture(
                sheet.baseTexture,
                new PIXI.Rectangle(frame.x, frame.y, frame.w, frame.h),
              );
              const sprite = new PIXI.Sprite(texture);
              sprite.x = request.col * map.tileDim + (request.offsetX ?? 0);
              sprite.y = request.row * map.tileDim + (request.offsetY ?? 0);
              if (scale !== 1) {
                sprite.scale.set(scale);
              }
              decalsContainer.addChild(sprite);
            }
          });
        }
      }
    }
    if (placedObjects.length > 0) {
      void loadAssetsManifest().then(async (assets) => {
        if (!assets?.objects || assets.objects.length === 0) return;
        const objectsById = new Map(assets.objects.map((obj) => [obj.id, obj]));

        const pathRules = await loadPathBorderRules();
        if (pathRules && pathRules.length > 0) {
          const ruleKeys = new Map<string, string>();
          for (const rule of pathRules) {
            const base = stripExtension(getBaseName(rule.baseTile));
            if (base) ruleKeys.set(normalizeKey(base), rule.name);
            ruleKeys.set(normalizeKey(rule.name), rule.name);
          }

          const pathTypeByObjectId = new Map<string, string>();
          for (const obj of assets.objects) {
            if (!obj.image) continue;
            if (obj.category !== 'paths' && obj.category !== 'flooring') continue;
            const imageKey = normalizeKey(stripExtension(getBaseName(obj.image)));
            const nameKey = normalizeKey(obj.name ?? '');
            const match = ruleKeys.get(imageKey) ?? ruleKeys.get(nameKey);
            if (match) pathTypeByObjectId.set(obj.id, match);
          }

          if (pathTypeByObjectId.size > 0) {
            const terrainIds = new Set(
              [terrainDecals?.grassId, terrainDecals?.sandId, terrainDecals?.waterId].filter(Boolean),
            );
            const terrainGrid: boolean[][] = Array.from({ length: screenxtiles }, () =>
              Array.from({ length: screenytiles }, () => false),
            );
            const pathGrid: (string | null)[][] = Array.from({ length: screenxtiles }, () =>
              Array.from({ length: screenytiles }, () => null),
            );

            for (const placement of placedObjects) {
              if (placement.col < 0 || placement.row < 0 || placement.col >= screenxtiles || placement.row >= screenytiles) continue;
              if (terrainIds.has(placement.objectId)) {
                terrainGrid[placement.col][placement.row] = true;
                continue;
              }
              const type = pathTypeByObjectId.get(placement.objectId);
              if (type) {
                pathGrid[placement.col][placement.row] = type;
              }
            }

            const borderRequests: Array<{ col: number; row: number; rule: PathBorderRule; frameKey: string }> = [];
            const rulesByName = new Map(pathRules.map((rule) => [rule.name, rule]));

            for (let col = 0; col < screenxtiles; col += 1) {
              for (let row = 0; row < screenytiles; row += 1) {
                const ruleName = pathGrid[col][row];
                if (!ruleName) continue;
                const rule = rulesByName.get(ruleName);
                if (!rule) continue;
                const north = row > 0 ? terrainGrid[col][row - 1] : false;
                const south = row < screenytiles - 1 ? terrainGrid[col][row + 1] : false;
                const west = col > 0 ? terrainGrid[col - 1][row] : false;
                const east = col < screenxtiles - 1 ? terrainGrid[col + 1][row] : false;

                if (north) borderRequests.push({ col, row, rule, frameKey: `${ruleName}_edge_N` });
                if (east) borderRequests.push({ col, row, rule, frameKey: `${ruleName}_edge_E` });
                if (south) borderRequests.push({ col, row, rule, frameKey: `${ruleName}_edge_S` });
                if (west) borderRequests.push({ col, row, rule, frameKey: `${ruleName}_edge_W` });

                if (north && east) borderRequests.push({ col, row, rule, frameKey: `${ruleName}_corner_NE` });
                if (north && west) borderRequests.push({ col, row, rule, frameKey: `${ruleName}_corner_NW` });
                if (south && east) borderRequests.push({ col, row, rule, frameKey: `${ruleName}_corner_SE` });
                if (south && west) borderRequests.push({ col, row, rule, frameKey: `${ruleName}_corner_SW` });
              }
            }

            if (borderRequests.length > 0) {
              const uniqueNames = Array.from(new Set(borderRequests.map((request) => request.rule.name)));
              const sheets = await Promise.all(
                uniqueNames.map(async (name) => {
                  const rule = rulesByName.get(name);
                  if (!rule) return [name, null] as const;
                  const sheet = await loadPathBorderSheet(rule);
                  return [name, sheet] as const;
                }),
              );
              const sheetByName = new Map<string, DecalSheet>();
              for (const [name, sheet] of sheets) {
                if (sheet) sheetByName.set(name, sheet);
              }

              for (const request of borderRequests) {
                const sheet = sheetByName.get(request.rule.name);
                if (!sheet) continue;
                const frame = sheet.frames[request.frameKey];
                if (!frame) continue;
                const texture = new PIXI.Texture(
                  sheet.baseTexture,
                  new PIXI.Rectangle(frame.x, frame.y, frame.w, frame.h),
                );
                const sprite = new PIXI.Sprite(texture);
                sprite.x = request.col * map.tileDim;
                sprite.y = request.row * map.tileDim;
                const scale = map.tileDim / sheet.tileSize;
                if (scale !== 1) {
                  sprite.scale.set(scale);
                }
                decalsContainer.addChild(sprite);
              }
            }
          }
        }

        const getObjectTileSize = (object: NonNullable<AssetsManifest['objects']>[number], rotation: number) => {
          const pixelWidth = Number(object.pixelWidth) || map.tileDim;
          const pixelHeight = Number(object.pixelHeight) || map.tileDim;
          const isGround = isGroundCategory(object.category);
          const isFence = object.category === 'fences';
          const baseTileWidth = isGround || isFence ? 1 : Math.max(1, Math.ceil(pixelWidth / map.tileDim));
          const baseTileHeight = isGround || isFence ? 1 : Math.max(1, Math.ceil(pixelHeight / map.tileDim));
          const rotated = rotation === 90 || rotation === 270;
          return {
            tileWidth: rotated ? baseTileHeight : baseTileWidth,
            tileHeight: rotated ? baseTileWidth : baseTileHeight,
          };
        };

        const getObjectAnchorOffset = (object: NonNullable<AssetsManifest['objects']>[number], rotation: number) => {
          const { tileWidth, tileHeight } = getObjectTileSize(object, rotation);
          if (object.anchor === 'center') {
            return {
              x: Math.floor(tileWidth / 2),
              y: Math.floor(tileHeight / 2),
            };
          }
          if (object.anchor === 'bottom-left') {
            return { x: 0, y: tileHeight - 1 };
          }
          return { x: 0, y: 0 };
        };

        const sorted = [...placedObjects].sort((a, b) => {
          const aDef = objectsById.get(a.objectId);
          const bDef = objectsById.get(b.objectId);
          if (!aDef || !bDef) return 0;
          const getZLayer = (def: NonNullable<AssetsManifest['objects']>[number]) => {
            if (isGroundCategory(def.category)) return 0;
            if (def.category === 'stamp') return 1;
            return 2;
          };
          const aLayer = getZLayer(aDef);
          const bLayer = getZLayer(bDef);
          if (aLayer !== bLayer) return aLayer - bLayer;
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
          const isGround = isGroundCategory(def.category);

          const { tileWidth, tileHeight } = getObjectTileSize(def, rotation);
          const anchor = getObjectAnchorOffset(def, rotation);
          const startCol = placement.col - anchor.x;
          const startRow = placement.row - anchor.y;
          const boundsWidth = tileWidth * map.tileDim;
          const boundsHeight = tileHeight * map.tileDim;
          const placementOffsetX = Number(placement.pixelOffsetX ?? 0);
          const placementOffsetY = Number(placement.pixelOffsetY ?? 0);

          const baseWidth = isGround ? map.tileDim : pixelWidth;
          const baseHeight = isGround ? map.tileDim : pixelHeight;
          const rotatedSize = getRotatedSize(baseWidth, baseHeight, rotation);
          let offsetX = 0;
          let offsetY = 0;
          if (!isGround) {
            if (def.anchor === 'bottom-left') {
              offsetY = Math.max(0, boundsHeight - rotatedSize.height);
            } else if (def.anchor === 'center') {
              offsetX = Math.max(0, Math.round((boundsWidth - rotatedSize.width) / 2));
              offsetY = Math.max(0, Math.round((boundsHeight - rotatedSize.height) / 2));
            }
          }

          const holder = new PIXI.Container();
          holder.x = startCol * map.tileDim + offsetX + placementOffsetX;
          holder.y = startRow * map.tileDim + offsetY + placementOffsetY;

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
          } else if (def.category === 'stamp') {
            stampObjectsContainer.addChild(holder);
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
