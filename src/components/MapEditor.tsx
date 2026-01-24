import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatedSprite as PixiAnimatedSprite, Container, Stage } from '@pixi/react';
import { StardewFrame } from '../ui/stardew/StardewFrame';
import { StardewButton } from '../ui/stardew/StardewButton';
import { StardewCheckbox } from '../ui/stardew/StardewCheckbox';
import { HangingSign } from '../ui/stardew/HangingSign';
import { StardewTab } from '../ui/stardew/StardewTab';
import { StardewSubTabGroup } from '../ui/stardew/StardewSubTab';
import { AssetSlicer } from './AssetSlicer';
import { BaseTexture, SCALE_MODES, Spritesheet, type ISpritesheetData } from 'pixi.js';
// Map editor starts with an empty canvas; tilesets are supplied via packs.
import * as campfire from '../../data/animations/campfire.json';
import * as gentlesparkle from '../../data/animations/gentlesparkle.json';
import * as gentlewaterfall from '../../data/animations/gentlewaterfall.json';
import * as gentlesplash from '../../data/animations/gentlesplash.json';
import * as windmill from '../../data/animations/windmill.json';
const DEFAULT_MAP_WIDTH = 45;
const DEFAULT_MAP_HEIGHT = 32;
const DEFAULT_TILE_SIZE = 32;
const EMPTY_TILESET_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgCj2R1kAAAAASUVORK5CYII=';
const PACK_INDEX_PATH = 'assets/packs/index.json';
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

const MAP_WIDTH = DEFAULT_MAP_WIDTH;
const MAP_HEIGHT = DEFAULT_MAP_HEIGHT;

// Collision layer tile meanings
const COLLISION_WALKABLE = 367; // Used as "force clear" override in the editor
const COLLISION_BLOCKED = 458;
const DEFAULT_LAYER_COUNT = 2;
const QUICKBAR_SLOTS = 8;
const PATH_SUBCATEGORIES = [
  { id: 'paths', label: 'paths' },
  { id: 'flooring', label: 'floor' },
] as const;
const PROP_SUBCATEGORIES = ['nature', 'furniture', 'decorations', 'fences', 'tile-object'] as const;

type MapAnimatedSprite = {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
  sheet: string;
  animation: string;
};

type TilesetConfig = {
  id: string;
  name: string;
  path: string;
  tileDim: number;
  pixelWidth: number;
  pixelHeight: number;
};

type TileCategory = 'terrain' | 'paths' | 'props' | 'buildings';
type TileCategoryFilter = 'all' | TileCategory;
type EditorMode = 'terrain' | 'paths' | 'props' | 'buildings' | 'objects' | 'prefabs';
type StampRotation = 0 | 90 | 180 | 270;
type DecalFrame = { x: number; y: number; w: number; h: number };
type DecalSheet = {
  frames: Record<string, DecalFrame>;
  meta: { width: number; height: number; tileSize: number };
  variantCounts: Record<string, number>;
  url: string;
};

type PathBorderRule = {
  name: string;
  baseTile: string;
  sheet: string;
  sheetJson: string;
};

type PathBorderSheet = {
  frames: Record<string, DecalFrame>;
  meta: { width: number; height: number; tileSize: number };
  url: string;
};

type PackTileset = {
  image: string;
  tileSize: number;
  pixelWidth: number;
  pixelHeight: number;
  categories?: Partial<Record<TileCategory, number[]>>;
};

type PackObject = {
  id: string;
  name: string;
  image: string;
  pixelWidth: number;
  pixelHeight: number;
  anchor?: ObjectAnchor;
  category?: string;
};

type AssetPack = {
  id: string;
  name: string;
  tileset?: PackTileset;
  objects?: PackObject[];
};

type StampDefinition = {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: number[][][];
};

type ObjectAnchor = 'top-left' | 'bottom-left' | 'center';

type ObjectDefinition = {
  id: string;
  name: string;
  tilesetId: string;
  tileX: number;
  tileY: number;
  tileWidth: number;
  tileHeight: number;
  anchor: ObjectAnchor;
  imagePath?: string;
  pixelWidth?: number;
  pixelHeight?: number;
  packId?: string;
  packName?: string;
  category?: string;
  readonly?: boolean;
};

type PlacedObject = {
  id: string;
  objectId: string;
  col: number;
  row: number;
  rotation?: ObjectRotation;
  pixelOffsetX?: number;
  pixelOffsetY?: number;
};

type EditorSnapshot = {
  bgLayers: number[][][];
  collisionLayer: number[][];
  placedObjects: PlacedObject[];
};

type SavedMapPayload = {
  version: number;
  mapWidth: number;
  mapHeight: number;
  tileset: TilesetConfig;
  bgLayers: number[][][];
  collisionLayer: number[][];
  autoCollisionEnabled?: boolean;
  placedObjects: PlacedObject[];
  animatedSprites: MapAnimatedSprite[];
  terrainDecals?: { grassId: string; sandId: string; waterId?: string } | null;
};

type AutoStampOptions = {
  minTiles: number;
  maxWidth: number;
  maxHeight: number;
  maxStamps: number;
  groundCoverage: number;
};

type ObjectRotation = 0 | 90 | 180 | 270;

const CATEGORY_FILTERS: Array<{ id: TileCategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'paths', label: 'Paths' },
  { id: 'props', label: 'Props' },
  { id: 'buildings', label: 'Buildings' },
];

const MODE_PRESETS: Array<{
  id: EditorMode;
  label: string;
  tool: 'brush' | 'eraser' | 'stamp' | 'object';
  category?: TileCategoryFilter;
  layer?: number;
}> = [
  { id: 'terrain', label: 'Terrain', tool: 'brush', category: 'all', layer: 0 },
  { id: 'paths', label: 'Paths', tool: 'brush', category: 'paths', layer: 0 },
  { id: 'props', label: 'Props', tool: 'stamp', layer: 1 }, // Legacy mapping
  { id: 'prefabs', label: 'Prefabs', tool: 'stamp', layer: 1 },
  { id: 'buildings', label: 'Buildings', tool: 'object', layer: 1 }, // Legacy mapping
  { id: 'objects', label: 'Objects', tool: 'object', layer: 1 },
];

const CATEGORY_STORAGE_KEY = 'ai-town.tilesetCategories.v1';
const STAMP_STORAGE_KEY = 'ai-town.tilesetStamps.v1';
const OBJECT_STORAGE_KEY = 'ai-town.tilesetObjects.v1';
const AUTO_STAMP_STORAGE_KEY = 'ai-town.tilesetAutoStamps.v1';
const MAP_SAVE_STORAGE_KEY = 'ai-town.mapEditor.save.v1';
const MAP_SAVE_VERSION = 1;
const AUTO_STAMP_LIMIT = 12;
const STAMP_PREVIEW_MAX_SIZE = 64;
const HISTORY_LIMIT = 100;
const TILESET_BASE_URL = import.meta.env.BASE_URL ?? '/';
const TILESET_BASE_PATH = TILESET_BASE_URL.endsWith('/') ? TILESET_BASE_URL : `${TILESET_BASE_URL}/`;

const resolveTilesetPath = (path: string) => {
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `${TILESET_BASE_PATH}${path}`;
};

const resolveAssetPath = (path: string) => resolveTilesetPath(encodeURI(path));

const createBlankLayer = (width: number, height: number) =>
  Array.from({ length: width }, () => Array.from({ length: height }, () => -1));

const createBlankLayers = (count: number, width: number, height: number) =>
  Array.from({ length: count }, () => createBlankLayer(width, height));

const cloneLayer = (layer: number[][]) => layer.map((column) => [...column]);
const cloneLayers = (layers: number[][][]) => layers.map((layer) => layer.map((column) => [...column]));
const clonePlacedObjects = (objects: PlacedObject[]) => objects.map((obj) => ({ ...obj }));

const normalizeRotation = (rotation: number): ObjectRotation => {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
};

const getRotatedSize = (width: number, height: number, rotation: ObjectRotation) =>
  rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };

const getRotationTransform = (width: number, height: number, rotation: ObjectRotation) => {
  if (rotation === 90) return `translate(0px, ${width}px) rotate(90deg)`;
  if (rotation === 180) return `translate(${width}px, ${height}px) rotate(180deg)`;
  if (rotation === 270) return `translate(${height}px, 0px) rotate(270deg)`;
  return 'none';
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

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const buildDecalVariantCounts = (frames: Record<string, DecalFrame>) => {
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

const LEGACY_OBJECT_ID_MAP: Record<string, string> = {
  'flooring-44': 'grass',
  'asset-9': 'sand',
  'asset-10': 'sea',
};

const normalizeLegacyId = (id: string) => LEGACY_OBJECT_ID_MAP[id] ?? id;

const normalizePlacedObjects = (objects: PlacedObject[]) => {
  let changed = false;
  const next = objects.map((obj) => {
    const normalized = normalizeLegacyId(obj.objectId);
    if (normalized !== obj.objectId) {
      changed = true;
      return { ...obj, objectId: normalized };
    }
    return obj;
  });
  return changed ? next : objects;
};

const DEFAULT_TILESET: TilesetConfig = {
  id: 'starter',
  name: 'Starter (empty)',
  path: EMPTY_TILESET_DATA_URI,
  tileDim: DEFAULT_TILE_SIZE,
  pixelWidth: DEFAULT_TILE_SIZE,
  pixelHeight: DEFAULT_TILE_SIZE,
};

const INITIAL_ANIMATED_SPRITES: MapAnimatedSprite[] = [];

const ANIMATION_SOURCES: Record<string, { spritesheet: ISpritesheetData; url: string }> = {
  'campfire.json': { spritesheet: campfire as ISpritesheetData, url: '/ai-town/assets/spritesheets/campfire.png' },
  'gentlesparkle.json': {
    spritesheet: gentlesparkle as ISpritesheetData,
    url: '/ai-town/assets/spritesheets/gentlesparkle32.png',
  },
  'gentlewaterfall.json': {
    spritesheet: gentlewaterfall as ISpritesheetData,
    url: '/ai-town/assets/spritesheets/gentlewaterfall32.png',
  },
  'windmill.json': { spritesheet: windmill as ISpritesheetData, url: '/ai-town/assets/spritesheets/windmill.png' },
  'gentlesplash.json': {
    spritesheet: gentlesplash as ISpritesheetData,
    url: '/ai-town/assets/spritesheets/gentlewaterfall32.png',
  },
};

const PIXI_ANIMATION_SPEED = 0.1;

const PixiAnimatedSpritesLayer = ({ sprites }: { sprites: MapAnimatedSprite[] }) => {
  const [spriteSheets, setSpriteSheets] = useState<Record<string, Spritesheet>>({});
  const sheetNames = useMemo(() => {
    const unique = new Set<string>();
    for (const sprite of sprites) {
      unique.add(sprite.sheet);
    }
    return Array.from(unique);
  }, [sprites]);

  useEffect(() => {
    let active = true;
    const loadSheets = async () => {
      const entries = await Promise.all(
        sheetNames.map(async (sheetName) => {
          const source = ANIMATION_SOURCES[sheetName];
          if (!source) return null;
          const sheet = new Spritesheet(
            BaseTexture.from(source.url, { scaleMode: SCALE_MODES.NEAREST }),
            source.spritesheet,
          );
          await sheet.parse();
          return [sheetName, sheet] as const;
        }),
      );
      if (!active) return;
      const loaded: Record<string, Spritesheet> = {};
      for (const entry of entries) {
        if (entry) {
          loaded[entry[0]] = entry[1];
        }
      }
      setSpriteSheets(loaded);
    };
    void loadSheets();
    return () => {
      active = false;
    };
  }, [sheetNames]);

  return (
    <Container>
      {sprites.map((sprite, index) => {
        const sheet = spriteSheets[sprite.sheet];
        const textures = sheet?.animations[sprite.animation];
        if (!textures) return null;
        return (
          <PixiAnimatedSprite
            key={`${sprite.sheet}-${sprite.animation}-${sprite.x}-${sprite.y}-${index}`}
            textures={textures}
            isPlaying={true}
            animationSpeed={PIXI_ANIMATION_SPEED}
            x={sprite.x}
            y={sprite.y}
            width={sprite.w}
            height={sprite.h}
          />
        );
      })}
    </Container>
  );
};

const MapEditor = () => {
  const [showAssetSlicer, setShowAssetSlicer] = useState(false);
  const [tileset, setTileset] = useState<TilesetConfig>(() => DEFAULT_TILESET);
  const [tilesetOptions, setTilesetOptions] = useState<TilesetConfig[]>([DEFAULT_TILESET]);
  const [assetPacks, setAssetPacks] = useState<AssetPack[]>([]);
  const [assetReloadToken, setAssetReloadToken] = useState(0);
  const [packLoadError, setPackLoadError] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [showCollision, setShowCollision] = useState(true); // Toggle collision overlay
  const [autoCollisionEnabled, setAutoCollisionEnabled] = useState(true);
  const [collisionEditMode, setCollisionEditMode] = useState(false);
  const [collisionBrush, setCollisionBrush] = useState<'block' | 'clear' | 'auto'>('block');
  const [showAnimatedSprites, setShowAnimatedSprites] = useState(true);
  const [showObjects, setShowObjects] = useState(true); // Toggle placed objects visibility
  const [showDecals] = useState(true);
  const [canvasScale, setCanvasScale] = useState(0.7); // Zoom level (0.3 - 2.0)
  const [isZoomCollapsed, setIsZoomCollapsed] = useState(false);
  const [tilesetLoaded, setTilesetLoaded] = useState(false);
  const [activeTool, setActiveTool] = useState<'brush' | 'eraser' | 'eyedropper' | 'stamp' | 'object'>('brush');
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [activeMode, setActiveMode] = useState<EditorMode>('objects');
  const [activeSubCategory, setActiveSubCategory] = useState<string>('nature');
  const [lastTileMode, setLastTileMode] = useState<EditorMode>('terrain');
  const [paletteMode, setPaletteMode] = useState<'used' | 'all'>('all');
  const [activeCategory, setActiveCategory] = useState<TileCategoryFilter>('all');
  const [bulkTagMode, setBulkTagMode] = useState(false);
  const [paletteSelection, setPaletteSelection] = useState<{ startId: number; endId: number } | null>(null);
  const [isPaletteSelecting, setIsPaletteSelecting] = useState(false);
  const [autoLayerByTransparency, setAutoLayerByTransparency] = useState(true);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [history, setHistory] = useState<{ past: EditorSnapshot[]; future: EditorSnapshot[] }>({
    past: [],
    future: [],
  });
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const pendingHistoryRef = useRef<EditorSnapshot | null>(null);
  const historyDirtyRef = useRef(false);
  const groundOverlayRef = useRef(false);
  const [animatedSprites, setAnimatedSprites] = useState<MapAnimatedSprite[]>(() => INITIAL_ANIMATED_SPRITES);
  const [tilesetLoadError, setTilesetLoadError] = useState<string | null>(null);
  const [transparentTiles, setTransparentTiles] = useState<boolean[]>([]);
  const [hiddenTiles, setHiddenTiles] = useState<boolean[]>([]);
  const [activeObjectRotation, setActiveObjectRotation] = useState<ObjectRotation>(0);
  const [tilesetCategories, setTilesetCategories] = useState<Record<string, Record<number, TileCategory>>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
      if (!stored) return {};
      return JSON.parse(stored) as Record<string, Record<number, TileCategory>>;
    } catch {
      return {};
    }
  });
  const [tilesetStamps, setTilesetStamps] = useState<Record<string, StampDefinition[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem(STAMP_STORAGE_KEY);
      if (!stored) return {};
      return JSON.parse(stored) as Record<string, StampDefinition[]>;
    } catch {
      return {};
    }
  });
  const [tilesetObjects, setTilesetObjects] = useState<Record<string, ObjectDefinition[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem(OBJECT_STORAGE_KEY);
      if (!stored) return {};
      return JSON.parse(stored) as Record<string, ObjectDefinition[]>;
    } catch {
      return {};
    }
  });
  const [placedObjects, setPlacedObjects] = useState<PlacedObject[]>([]);
  const [activeStampId, setActiveStampId] = useState<string | null>(null);
  const [stampCaptureMode, setStampCaptureMode] = useState(false);
  const [isStampSelecting, setIsStampSelecting] = useState(false);
  const [stampSelection, setStampSelection] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);
  const [stampNameDraft, setStampNameDraft] = useState('');
  const [stampSkipEmpty, setStampSkipEmpty] = useState(true);
  const [stampRotation, setStampRotation] = useState<StampRotation>(0);
  const [stampFlipX, setStampFlipX] = useState(false);
  const [stampFlipY, setStampFlipY] = useState(false);
  const [editingStampId, setEditingStampId] = useState<string | null>(null);
  const [stampRenameDraft, setStampRenameDraft] = useState('');
  const [activeObjectId, setActiveObjectId] = useState<string | null>(null);
  // activeObjectPackId removed - we now load objects from all packs
  const [objectCaptureMode, setObjectCaptureMode] = useState(false);
  const [objectPaletteSelection, setObjectPaletteSelection] = useState<{ startId: number; endId: number } | null>(null);
  const [objectNameDraft, setObjectNameDraft] = useState('');
  const [objectAnchor, setObjectAnchor] = useState<ObjectAnchor>('bottom-left');
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [objectRenameDraft, setObjectRenameDraft] = useState('');
  const [isObjectPaletteSelecting, setIsObjectPaletteSelecting] = useState(false);
  const [deleteModifierActive, setDeleteModifierActive] = useState(false);
  const [decalGrassId, setDecalGrassId] = useState<string | null>(null);
  const [decalSandId, setDecalSandId] = useState<string | null>(null);
  const [decalWaterId, setDecalWaterId] = useState<string | null>(null);
  const [decalSheets, setDecalSheets] = useState<Record<DecalSheetKey, DecalSheet | null>>({
    grassInSand: null,
    shoreOnSand: null,
    shoreOnWater: null,
  });
  const [pathBorderRules, setPathBorderRules] = useState<PathBorderRule[]>([]);
  const [pathBorderSheets, setPathBorderSheets] = useState<Record<string, PathBorderSheet>>({});
  const [pathBorderLoadError, setPathBorderLoadError] = useState<string | null>(null);
  const [, setDecalLoadError] = useState<string | null>(null);
  const [showAutoStampOptions, setShowAutoStampOptions] = useState(false);
  const [autoStampOptions, setAutoStampOptions] = useState<AutoStampOptions>({
    minTiles: 6,
    maxWidth: 16,
    maxHeight: 16,
    maxStamps: AUTO_STAMP_LIMIT,
    groundCoverage: 0.7,
  });
  const [autoGeneratedStamps, setAutoGeneratedStamps] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem(AUTO_STAMP_STORAGE_KEY);
      if (!stored) return {};
      return JSON.parse(stored) as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const [hoverInfo, setHoverInfo] = useState<{
    row: number;
    col: number;
    tileId: number;
    tileLayerIndex: number;
    collisionValue: number;
  } | null>(null);
  const [hoverPixelOffset, setHoverPixelOffset] = useState<{ x: number; y: number } | null>(null);
  const tilesetRef = useRef<HTMLImageElement | null>(null);
  const dragToolRef = useRef<'brush' | 'eraser' | 'eyedropper' | 'stamp' | 'object' | null>(null);
  const stampFileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const deleteDragRef = useRef(false);
  const collisionDragRef = useRef(false);

  const getPointerPixelOffset = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = canvasScale || 1;
    const localX = (event.clientX - rect.left) / scale;
    const localY = (event.clientY - rect.top) / scale;
    const half = tileSize / 2;
    const maxOffset = Math.floor(half);
    const offsetX = clampNumber(Math.round(localX - half), -maxOffset, maxOffset);
    const offsetY = clampNumber(Math.round(localY - half), -maxOffset, maxOffset);
    return { x: offsetX, y: offsetY };
  };

  useEffect(() => {
    let active = true;
    const loadPacks = async () => {
      try {
        setPackLoadError(null);
        
        // ONLY load from assets.json (Tileset Asset folder)
        // Skip old pack index loading to avoid extra objects
        let categoryObjects: PackObject[] = [];
        try {
          const assetsUrl = resolveAssetPath(ASSETS_JSON_PATH);
          const assetsResponse = await fetch(assetsUrl, { cache: 'no-store' });
          if (assetsResponse.ok) {
            const assetsData = await assetsResponse.json();
            if (Array.isArray(assetsData?.objects)) {
              categoryObjects = assetsData.objects.map((obj: any) => {
                // Calculate scale to normalize to 32px baseline if not provided
                const maxDim = Math.max(obj.pixelWidth ?? 64, obj.pixelHeight ?? 64);
                const autoScale = obj.scale ?? (32 / maxDim); // Normalize to 32px visual size
                return {
                  id: obj.id,
                  name: obj.name,
                  image: obj.image,
                  pixelWidth: obj.pixelWidth ?? 64,
                  pixelHeight: obj.pixelHeight ?? 64,
                  anchor: obj.anchor ?? 'bottom-left',
                  category: obj.category,
                  scale: autoScale, // Normalized scale
                };
              });
            }
          }
        } catch (e) {
          console.warn('Could not load assets.json:', e);
        }
        
        if (!active) return;
        
        // Create a single pack from assets.json only
        const allPacks: AssetPack[] = [];
        if (categoryObjects.length > 0) {
          allPacks.push({
            id: 'tileset-assets',
            name: 'Tileset Assets',
            objects: categoryObjects,
          });
        }
        setAssetPacks(allPacks);
      } catch (error) {
        console.error('Failed to load asset packs:', error);
        if (!active) return;
        setAssetPacks([]);
        setPackLoadError('Failed to load asset packs.');
      }
    };
    void loadPacks();
    return () => {
      active = false;
    };
  }, [assetReloadToken]);

  useEffect(() => {
    if (collisionEditMode) {
      setShowCollision(true);
    }
  }, [collisionEditMode]);

  useEffect(() => {
    let active = true;
    const loadDecals = async () => {
      try {
        setDecalLoadError(null);
        const entries = Object.entries(DECAL_SHEETS) as Array<[DecalSheetKey, typeof DECAL_SHEETS[DecalSheetKey]]>;
        const results = await Promise.all(
          entries.map(async ([key, sheet]) => {
            try {
              const response = await fetch(resolveAssetPath(sheet.json), { cache: 'no-store' });
              if (!response.ok) throw new Error(`Missing ${key} (${response.status})`);
              const data = await response.json();
              const frames = (data?.frames ?? {}) as Record<string, DecalFrame>;
              const tileSize = Number(data?.tileSize) || DEFAULT_TILE_SIZE;
              let maxX = 0;
              let maxY = 0;
              for (const frame of Object.values(frames)) {
                maxX = Math.max(maxX, frame.x + frame.w);
                maxY = Math.max(maxY, frame.y + frame.h);
              }
              return [
                key,
                {
                  frames,
                  meta: { width: maxX, height: maxY, tileSize },
                  variantCounts: buildDecalVariantCounts(frames),
                  url: resolveAssetPath(sheet.png),
                },
              ] as const;
            } catch (error) {
              console.warn('Failed to load decal sheet:', key, error);
              return [key, null] as const;
            }
          }),
        );
        if (!active) return;
        const nextSheets: Record<DecalSheetKey, DecalSheet | null> = {
          grassInSand: null,
          shoreOnSand: null,
          shoreOnWater: null,
        };
        let missing = 0;
        for (const [key, sheet] of results) {
          nextSheets[key] = sheet;
          if (!sheet) missing += 1;
        }
        setDecalSheets(nextSheets);
        setDecalLoadError(missing > 0 ? 'Missing decal pack.' : null);
      } catch (error) {
        if (!active) return;
        console.warn('Failed to load decal sheets:', error);
        setDecalSheets({ grassInSand: null, shoreOnSand: null, shoreOnWater: null });
        setDecalLoadError('Missing decal pack.');
      }
    };
    void loadDecals();
    return () => {
      active = false;
    };
  }, [assetReloadToken]);

  useEffect(() => {
    let active = true;
    const loadPathBorders = async () => {
      try {
        setPathBorderLoadError(null);
        const response = await fetch(resolveAssetPath(PATH_BORDER_PACK.config), { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Missing path border config (${response.status})`);
        }
        const data = await response.json();
        const rules = (data?.paths ?? []).map((entry: any) => ({
          name: String(entry?.name ?? ''),
          baseTile: String(entry?.baseTile ?? ''),
          sheet: String(entry?.sheet ?? ''),
          sheetJson: String(entry?.sheetJson ?? ''),
        })) as PathBorderRule[];

        const sheetEntries = await Promise.all(
          rules.map(async (rule) => {
            if (!rule.sheetJson || !rule.sheet || !rule.name) return [rule.name, null] as const;
            try {
              const sheetJsonPath = `${PATH_BORDER_PACK.base}/${rule.sheetJson}`;
              const sheetPngPath = `${PATH_BORDER_PACK.base}/${rule.sheet}`;
              const sheetResponse = await fetch(resolveAssetPath(sheetJsonPath), { cache: 'no-store' });
              if (!sheetResponse.ok) return [rule.name, null] as const;
              const sheetData = await sheetResponse.json();
              const frames = (sheetData?.frames ?? {}) as Record<string, DecalFrame>;
              const tileSize = Number(sheetData?.tileSize) || DEFAULT_TILE_SIZE;
              let maxX = 0;
              let maxY = 0;
              for (const frame of Object.values(frames)) {
                maxX = Math.max(maxX, frame.x + frame.w);
                maxY = Math.max(maxY, frame.y + frame.h);
              }
              return [
                rule.name,
                {
                  frames,
                  meta: { width: maxX, height: maxY, tileSize },
                  url: resolveAssetPath(sheetPngPath),
                },
              ] as const;
            } catch (error) {
              console.warn('Failed to load path border sheet:', rule.name, error);
              return [rule.name, null] as const;
            }
          }),
        );

        if (!active) return;
        const nextSheets: Record<string, PathBorderSheet> = {};
        let missing = 0;
        for (const [name, sheet] of sheetEntries) {
          if (sheet) {
            nextSheets[name] = sheet;
          } else if (name) {
            missing += 1;
          }
        }
        setPathBorderRules(rules);
        setPathBorderSheets(nextSheets);
        setPathBorderLoadError(missing > 0 ? 'Missing path border sheets.' : null);
      } catch (error) {
        if (!active) return;
        console.warn('Failed to load path border pack:', error);
        setPathBorderRules([]);
        setPathBorderSheets({});
        setPathBorderLoadError('Missing path border pack.');
      }
    };
    void loadPathBorders();
    return () => {
      active = false;
    };
  }, [assetReloadToken]);

  useEffect(() => {
    const nextOptions = assetPacks
      .filter((pack) => Boolean(pack.tileset))
      .map((pack) => ({
        id: pack.id,
        name: pack.name,
        path: pack.tileset?.image ?? EMPTY_TILESET_DATA_URI,
        tileDim: pack.tileset?.tileSize ?? DEFAULT_TILE_SIZE,
        pixelWidth: pack.tileset?.pixelWidth ?? DEFAULT_TILE_SIZE,
        pixelHeight: pack.tileset?.pixelHeight ?? DEFAULT_TILE_SIZE,
      }));
    if (nextOptions.length === 0) {
      setTilesetOptions([DEFAULT_TILESET]);
      return;
    }
    setTilesetOptions(nextOptions);
  }, [assetPacks]);

  useEffect(() => {
    const match = tilesetOptions.find((option) => option.id === tileset.id);
    if (!match) {
      setTileset(tilesetOptions[0] ?? DEFAULT_TILESET);
      return;
    }
    if (
      match.path !== tileset.path ||
      match.tileDim !== tileset.tileDim ||
      match.pixelWidth !== tileset.pixelWidth ||
      match.pixelHeight !== tileset.pixelHeight ||
      match.name !== tileset.name
    ) {
      setTileset(match);
    }
  }, [tilesetOptions, tileset]);

  const tilesetPack = useMemo(
    () => assetPacks.find((pack) => pack.id === tileset.id) ?? null,
    [assetPacks, tileset.id],
  );

  const objectPacks = useMemo(
    () => assetPacks.filter((pack) => (pack.objects?.length ?? 0) > 0),
    [assetPacks],
  );

  const reloadAssets = useCallback(() => {
    setAssetReloadToken((prev) => prev + 1);
  }, []);

  // Pack switching effect removed - we now load all objects from all packs

  const tileSize = tileset.tileDim;
  const tilesetCols = Math.floor(tileset.pixelWidth / tileSize);
  const tilesetRows = Math.floor(tileset.pixelHeight / tileSize);
  const mapPixelWidth = MAP_WIDTH * tileSize;
  const mapPixelHeight = MAP_HEIGHT * tileSize;
  const tilesetUrl = useMemo(() => resolveAssetPath(tileset.path), [tileset.path]);
  const terrainDecalConfig = useMemo(() => {
    if (!decalGrassId || !decalSandId) return null;
    if (decalGrassId === decalSandId) return null;
    if (decalWaterId && (decalWaterId === decalGrassId || decalWaterId === decalSandId)) return null;
    return { grassId: decalGrassId, sandId: decalSandId, waterId: decalWaterId ?? undefined };
  }, [decalGrassId, decalSandId, decalWaterId]);

  // Combine all BG layers for rendering (layer 0 is base, layer 1+ are overlays)
  // bgLayers structure: bgLayers[layerIndex][x][y] = tileIndex
  const [bgLayers, setBgLayers] = useState<number[][][]>(() =>
    createBlankLayers(DEFAULT_LAYER_COUNT, MAP_WIDTH, MAP_HEIGHT),
  );

  const [collisionLayer, setCollisionLayer] = useState<number[][]>(() =>
    createBlankLayer(MAP_WIDTH, MAP_HEIGHT),
  );

  const createSnapshot = useCallback(
    (): EditorSnapshot => ({
      bgLayers: cloneLayers(bgLayers),
      collisionLayer: cloneLayer(collisionLayer),
      placedObjects: clonePlacedObjects(placedObjects),
    }),
    [bgLayers, collisionLayer, placedObjects],
  );

  const beginHistoryCapture = useCallback(() => {
    if (pendingHistoryRef.current) return;
    pendingHistoryRef.current = createSnapshot();
    historyDirtyRef.current = false;
  }, [createSnapshot]);

  const markHistoryDirty = useCallback(() => {
    if (!pendingHistoryRef.current) return;
    historyDirtyRef.current = true;
  }, []);

  const commitHistoryCapture = useCallback(() => {
    if (pendingHistoryRef.current && historyDirtyRef.current) {
      setHistory((prev) => ({
        past: [...prev.past, pendingHistoryRef.current!].slice(-HISTORY_LIMIT),
        future: [],
      }));
    }
    pendingHistoryRef.current = null;
    historyDirtyRef.current = false;
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const rest = prev.past.slice(0, -1);
      const current = createSnapshot();
      pendingHistoryRef.current = null;
      historyDirtyRef.current = false;
      setBgLayers(previous.bgLayers);
      setCollisionLayer(previous.collisionLayer);
      setPlacedObjects(previous.placedObjects);
      return {
        past: rest,
        future: [current, ...prev.future],
      };
    });
  }, [createSnapshot]);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const rest = prev.future.slice(1);
      const current = createSnapshot();
      pendingHistoryRef.current = null;
      historyDirtyRef.current = false;
      setBgLayers(next.bgLayers);
      setCollisionLayer(next.collisionLayer);
      setPlacedObjects(next.placedObjects);
      return {
        past: [...prev.past, current].slice(-HISTORY_LIMIT),
        future: rest,
      };
    });
  }, [createSnapshot]);

  const usedTileStats = useMemo(() => {
    const counts = new Map<number, number>();
    for (const layer of bgLayers) {
      for (const column of layer) {
        for (const tileId of column) {
          if (tileId < 0) continue;
          counts.set(tileId, (counts.get(tileId) ?? 0) + 1);
        }
      }
    }
    const usedIds = Array.from(counts.keys());
    usedIds.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a - b);
    return { usedIds, counts };
  }, [bgLayers]);

  const tileUsage = useMemo(() => {
    const base = new Set<number>();
    const overlay = new Set<number>();
    bgLayers.forEach((layer, layerIndex) => {
      for (const column of layer) {
        for (const tileId of column) {
          if (tileId < 0) continue;
          if (layerIndex === 0) {
            base.add(tileId);
          } else {
            overlay.add(tileId);
          }
        }
      }
    });
    return { base, overlay };
  }, [bgLayers]);

  const packCategoryAssignments = useMemo(() => {
    const categories = tilesetPack?.tileset?.categories;
    if (!categories) return {};
    const assignments: Record<number, TileCategory> = {};
    (Object.entries(categories) as Array<[TileCategory, number[]]>).forEach(([category, tileIds]) => {
      if (!Array.isArray(tileIds)) return;
      tileIds.forEach((tileId) => {
        if (Number.isFinite(tileId)) {
          assignments[Number(tileId)] = category;
        }
      });
    });
    return assignments;
  }, [tilesetPack]);

  const tilesetCategoryAssignments = useMemo(() => {
    const saved = tilesetCategories[tileset.id] ?? {};
    return { ...packCategoryAssignments, ...saved };
  }, [packCategoryAssignments, tilesetCategories, tileset.id]);
  const tilesetStampsForSet = tilesetStamps[tileset.id] ?? [];
  const activeStamp = tilesetStampsForSet.find((stamp) => stamp.id === activeStampId) ?? null;
  const userObjectsForSet = useMemo(
    () => tilesetObjects[tileset.id] ?? [],
    [tilesetObjects, tileset.id],
  );
  const builtinObjectsForSet = useMemo(() => {
    // Load objects from ALL packs that have objects
    const allObjects: ObjectDefinition[] = [];
    for (const pack of objectPacks) {
      if (!pack.objects || pack.objects.length === 0) continue;
      for (const source of pack.objects) {
        if (!source?.id || !source?.image) continue;
        const pixelWidth = Number(source.pixelWidth) || tileSize;
        const pixelHeight = Number(source.pixelHeight) || tileSize;

        // For terrain/paths, always use 1x1 tile grid regardless of pixel size
        // This ensures 64x64 terrain tiles align to single grid cells
        const isGroundTile = isGroundCategory(source.category);
        const isFence = source.category === 'fences';
        const tileWidth = isGroundTile || isFence ? 1 : Math.max(1, Math.ceil(pixelWidth / tileSize));
        const tileHeight = isGroundTile || isFence ? 1 : Math.max(1, Math.ceil(pixelHeight / tileSize));

        const normalizedName = source.name.replace(/(\D)(\d)/g, '$1 $2');
        allObjects.push({
          id: source.id,
          name: normalizedName,
          tilesetId: tileset.id,
          tileX: 0,
          tileY: 0,
          tileWidth,
          tileHeight,
          anchor: source.anchor ?? ('bottom-left' as ObjectAnchor),
          imagePath: source.image,
          pixelWidth,
          pixelHeight,
          packId: pack.id,
          packName: pack.name,
          category: source.category,
          readonly: true,
        });
      }
    }
    return allObjects;
  }, [objectPacks, tileSize, tileset.id]);
  const tilesetObjectsForSet = useMemo(
    () => [...builtinObjectsForSet, ...userObjectsForSet],
    [builtinObjectsForSet, userObjectsForSet],
  );
  const activeObject = tilesetObjectsForSet.find((obj) => obj.id === activeObjectId) ?? null;
    const activeToolLabel =
    activeTool === 'stamp'
      ? `Stamp${activeStamp ? `: ${activeStamp.name}` : ''}${stampRotation ? ` (${stampRotation}deg)` : ''}`
      : activeTool === 'object'
      ? `Object${activeObject ? `: ${activeObject.name}` : ''}${activeObjectRotation ? ` (${activeObjectRotation}°)` : ''}`
      : `${activeTool.charAt(0).toUpperCase()}${activeTool.slice(1)}`;

  const objectsById = useMemo(() => {
    const map = new Map<string, ObjectDefinition>();
    for (const obj of tilesetObjectsForSet) {
      map.set(obj.id, obj);
    }
    return map;
  }, [tilesetObjectsForSet]);

  const zigzagTerrainOptions = useMemo(
    () => tilesetObjectsForSet.filter((obj) => obj.category === 'terrain'),
    [tilesetObjectsForSet],
  );

  useEffect(() => {
    if (zigzagTerrainOptions.length === 0) {
      setDecalGrassId(null);
      setDecalSandId(null);
      setDecalWaterId(null);
      return;
    }

    const nameToId = new Map(
      zigzagTerrainOptions.map((opt) => [opt.name.toLowerCase().trim(), opt.id]),
    );
    const desiredGrass = nameToId.get('grass');
    const desiredSand = nameToId.get('sand');
    const desiredWater = nameToId.get('water') ?? nameToId.get('sea');

    if (!decalGrassId || !zigzagTerrainOptions.some((opt) => opt.id === decalGrassId)) {
      setDecalGrassId(desiredGrass ?? zigzagTerrainOptions[0].id);
    }
    if (
      !decalSandId ||
      !zigzagTerrainOptions.some((opt) => opt.id === decalSandId) ||
      decalSandId === decalGrassId
    ) {
      const fallback =
        desiredSand && desiredSand !== decalGrassId
          ? desiredSand
          : zigzagTerrainOptions.find((opt) => opt.id !== decalGrassId)?.id;
      setDecalSandId(fallback ?? null);
    }
    if (!decalWaterId || !zigzagTerrainOptions.some((opt) => opt.id === decalWaterId)) {
      const fallback =
        desiredWater && desiredWater !== decalGrassId && desiredWater !== decalSandId
          ? desiredWater
          : zigzagTerrainOptions.find(
              (opt) => opt.id !== decalGrassId && opt.id !== decalSandId,
            )?.id;
      setDecalWaterId(fallback ?? null);
    }
  }, [zigzagTerrainOptions, decalGrassId, decalSandId, decalWaterId]);


  useEffect(() => {
    setActiveStampId(null);
    setStampCaptureMode(false);
    setStampSelection(null);
    setStampNameDraft('');
    setIsStampSelecting(false);
    setBulkTagMode(false);
    setPaletteSelection(null);
    setIsPaletteSelecting(false);
    setEditingStampId(null);
    setStampRenameDraft('');
    setActiveObjectId(null);
    setObjectCaptureMode(false);
    setObjectPaletteSelection(null);
    setObjectNameDraft('');
    setObjectAnchor('bottom-left');
    setEditingObjectId(null);
    setObjectRenameDraft('');
    setIsObjectPaletteSelecting(false);
  }, [tileset.id]);

  useEffect(() => {
    setStampRotation(0);
    setStampFlipX(false);
    setStampFlipY(false);
  }, [activeStampId]);

  useEffect(() => {
    if (activeObject?.category !== 'stamp') {
      setHoverPixelOffset(null);
    }
  }, [activeObject?.category]);

  const resetMap = (options?: { animated: MapAnimatedSprite[] }) => {
    setBgLayers(createBlankLayers(DEFAULT_LAYER_COUNT, MAP_WIDTH, MAP_HEIGHT));
    setCollisionLayer(createBlankLayer(MAP_WIDTH, MAP_HEIGHT));
    setAnimatedSprites(options?.animated ?? []);
    setPlacedObjects([]);
    setSelectedTileId(null);
    setActiveLayerIndex(0);
    setPaletteMode('all');
    setActiveCategory('all');
    setStampSelection(null);
    setIsStampSelecting(false);
  };

  useEffect(() => {
    if (!bulkTagMode || paletteMode !== 'all' || activeCategory !== 'all') {
      setPaletteSelection(null);
      setIsPaletteSelecting(false);
    }
  }, [bulkTagMode, paletteMode, activeCategory]);

  useEffect(() => {
    if (objectCaptureMode) return;
    setObjectPaletteSelection(null);
    setIsObjectPaletteSelecting(false);
  }, [objectCaptureMode]);

  const handleTilesetChange = (nextId: string) => {
    const next = tilesetOptions.find((item) => item.id === nextId);
    if (!next || next.id === tileset.id) return;
    const confirmed = window.confirm(
      'Switching tileset will reset the current map. Continue?',
    );
    if (!confirmed) return;
    setTileset(next);
    resetMap({ animated: [] });
  };

  // Preload tileset image
  useEffect(() => {
    setTilesetLoaded(false);
    setTilesetLoadError(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = tilesetUrl;
    img.onload = () => {
      tilesetRef.current = img;
      setTilesetLoaded(true);
    };
    img.onerror = () => {
      console.error('Failed to load tileset image:', tilesetUrl);
      setTilesetLoadError(`Failed to load tileset: ${tilesetUrl}`);
    };
  }, [tilesetUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(tilesetCategories));
  }, [tilesetCategories]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STAMP_STORAGE_KEY, JSON.stringify(tilesetStamps));
  }, [tilesetStamps]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(OBJECT_STORAGE_KEY, JSON.stringify(tilesetObjects));
  }, [tilesetObjects]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AUTO_STAMP_STORAGE_KEY, JSON.stringify(autoGeneratedStamps));
  }, [autoGeneratedStamps]);

  useEffect(() => {
    if (!tilesetLoaded || !tilesetRef.current) {
      setTransparentTiles([]);
      setHiddenTiles([]);
      return;
    }
    const img = tilesetRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = tileset.pixelWidth;
    canvas.height = tileset.pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setTransparentTiles([]);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    let data: Uint8ClampedArray;
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      data = imageData.data;
    } catch (error) {
      console.error('Failed to read tileset pixels:', error);
      setTransparentTiles([]);
      setHiddenTiles([]);
      setTilesetLoadError('Failed to read tileset pixels. Check image origin/CORS.');
      return;
    }
    const tileCount = tilesetRows * tilesetCols;
    const hasTransparency = Array.from({ length: tileCount }, () => false);
    const isHidden = Array.from({ length: tileCount }, () => false);
    for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
      const tileRow = Math.floor(tileIndex / tilesetCols);
      const tileCol = tileIndex % tilesetCols;
      const startX = tileCol * tileSize;
      const startY = tileRow * tileSize;
      let transparent = false;
      let isFullyTransparent = true;
      let isSolidColor = true;
      let firstR = -1;
      let firstG = -1;
      let firstB = -1;
      let firstA = -1;
      for (let y = 0; y < tileSize; y += 1) {
        const rowOffset = (startY + y) * canvas.width;
        for (let x = 0; x < tileSize; x += 1) {
          const pixelIndex = (rowOffset + startX + x) * 4;
          const r = data[pixelIndex];
          const g = data[pixelIndex + 1];
          const b = data[pixelIndex + 2];
          const a = data[pixelIndex + 3];
          if (firstR === -1) {
            firstR = r;
            firstG = g;
            firstB = b;
            firstA = a;
          } else if (isSolidColor && (r !== firstR || g !== firstG || b !== firstB || a !== firstA)) {
            isSolidColor = false;
          }
          if (a !== 0) {
            isFullyTransparent = false;
          }
          if (a < 255) {
            transparent = true;
          }
        }
      }
      hasTransparency[tileIndex] = transparent;
      const isSolidBlack = isSolidColor && firstA === 255 && firstR === 0 && firstG === 0 && firstB === 0;
      isHidden[tileIndex] = isFullyTransparent || isSolidBlack;
    }
    setTransparentTiles(hasTransparency);
    setHiddenTiles(isHidden);
  }, [
    tilesetLoaded,
    tileSize,
    tilesetCols,
    tilesetRows,
    tileset.pixelWidth,
    tileset.pixelHeight,
  ]);

  // Get the x, y position in the tileset for a given tile ID
  const getTilePos = (tileId: number): { sx: number; sy: number } => {
    if (tileId < 0) return { sx: -1, sy: -1 };
    const row = Math.floor(tileId / tilesetCols);
    const col = tileId % tilesetCols;
    return { sx: col * tileSize, sy: row * tileSize };
  };

  const selectObjectId = (objectId: string) => {
    if (!objectId) return;
    setActiveObjectId(objectId);
    setActiveTool('object');
    setActiveMode('objects');
  };

  const selectTileId = (tileId: number, options?: { layerOverride?: number }) => {
    setSelectedTileId(tileId);
    if (tileId >= 0) {
      setActiveTool('brush');
      if (typeof options?.layerOverride === 'number' && options.layerOverride >= 0) {
        setActiveLayerIndex(options.layerOverride);
      } else if (autoLayerByTransparency) {
        setActiveLayerIndex(transparentTiles[tileId] ? 1 : 0);
      }
    } else {
      setActiveTool('eraser');
    }
  };

  const selectedTileCategory =
    selectedTileId !== null && selectedTileId >= 0
      ? tilesetCategoryAssignments[selectedTileId]
      : undefined;

  const assignSelectedToCategory = (category: TileCategory | null) => {
    if (selectedTileId === null || selectedTileId < 0) return;
    setTilesetCategories((prev) => {
      const next = { ...prev };
      const current = { ...(next[tileset.id] ?? {}) };
      if (category) {
        current[selectedTileId] = category;
      } else {
        delete current[selectedTileId];
      }
      next[tileset.id] = current;
      return next;
    });
  };

  const autoTagUsedTiles = () => {
    if (usedTileStats.usedIds.length === 0) return;
    setTilesetCategories((prev) => {
      const next = { ...prev };
      const current = { ...(next[tileset.id] ?? {}) };
      for (const tileId of usedTileStats.usedIds) {
        if (hiddenTiles[tileId]) continue;
        if (current[tileId]) continue;
        if (tileUsage.overlay.has(tileId) || transparentTiles[tileId]) {
          current[tileId] = 'props';
        } else {
          current[tileId] = 'terrain';
        }
      }
      next[tileset.id] = current;
      return next;
    });
  };

  const applyCategoryToSelection = (category: TileCategory | null) => {
    if (paletteSelectionSet.size === 0) return;
    setTilesetCategories((prev) => {
      const next = { ...prev };
      const current = { ...(next[tileset.id] ?? {}) };
      paletteSelectionSet.forEach((tileId) => {
        if (hiddenTiles[tileId]) return;
        if (category) {
          current[tileId] = category;
        } else {
          delete current[tileId];
        }
      });
      next[tileset.id] = current;
      return next;
    });
  };

  const updateAutoStampOptions = (partial: Partial<AutoStampOptions>) => {
    setAutoStampOptions((prev) => ({ ...prev, ...partial }));
  };

  const applyMode = useCallback((mode: EditorMode) => {
    setActiveMode(mode);
    const preset = MODE_PRESETS.find((item) => item.id === mode);
    if (!preset) return;
    setActiveTool(preset.tool);
    if (preset.tool === 'brush' && preset.category) {
      setActiveCategory(preset.category);
      setPaletteMode('all');
    }
    if (typeof preset.layer === 'number') {
      setActiveLayerIndex(preset.layer);
    }
    if (mode !== 'objects' && mode !== 'prefabs') {
      setLastTileMode(mode);
    }
  }, []);

  const allTileIds = useMemo(
    () => Array.from({ length: tilesetRows * tilesetCols }, (_, index) => index),
    [tilesetRows, tilesetCols],
  );

  const visibleAllTileIds = useMemo(
    () => allTileIds.filter((tileId) => !hiddenTiles[tileId]),
    [allTileIds, hiddenTiles],
  );

  const visibleUsedTileIds = useMemo(
    () => usedTileStats.usedIds.filter((tileId) => !hiddenTiles[tileId]),
    [usedTileStats.usedIds, hiddenTiles],
  );

  const basePaletteTileIds = paletteMode === 'used' ? visibleUsedTileIds : visibleAllTileIds;

  const categoryCounts = useMemo(() => {
    const counts: Record<TileCategoryFilter, number> = {
      all: basePaletteTileIds.length,
      terrain: 0,
      paths: 0,
      props: 0,
      buildings: 0,
    };
    for (const tileId of basePaletteTileIds) {
      const category = tilesetCategoryAssignments[tileId];
      if (category) counts[category] += 1;
    }
    return counts;
  }, [basePaletteTileIds, tilesetCategoryAssignments]);

  const paletteTileIds = objectCaptureMode
    ? allTileIds
    : activeCategory === 'all'
    ? basePaletteTileIds
    : basePaletteTileIds.filter((tileId) => tilesetCategoryAssignments[tileId] === activeCategory);

  const paletteSelectionBounds = useMemo(() => {
    if (!paletteSelection || !bulkTagMode || paletteMode !== 'all' || activeCategory !== 'all') return null;
    const startRow = Math.floor(paletteSelection.startId / tilesetCols);
    const startCol = paletteSelection.startId % tilesetCols;
    const endRow = Math.floor(paletteSelection.endId / tilesetCols);
    const endCol = paletteSelection.endId % tilesetCols;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    return { minRow, maxRow, minCol, maxCol };
  }, [paletteSelection, bulkTagMode, paletteMode, activeCategory, tilesetCols]);

  const paletteSelectionSet = useMemo(() => {
    if (!paletteSelectionBounds) return new Set<number>();
    const selected = new Set<number>();
    for (let row = paletteSelectionBounds.minRow; row <= paletteSelectionBounds.maxRow; row += 1) {
      for (let col = paletteSelectionBounds.minCol; col <= paletteSelectionBounds.maxCol; col += 1) {
        const tileId = row * tilesetCols + col;
        if (tileId >= 0 && tileId < tilesetCols * tilesetRows) {
          if (hiddenTiles[tileId]) continue;
          selected.add(tileId);
        }
      }
    }
    return selected;
  }, [paletteSelectionBounds, tilesetCols, tilesetRows, hiddenTiles]);

  const paletteSelectionCount = paletteSelectionSet.size;

  const objectSelectionBounds = useMemo(() => {
    if (!objectPaletteSelection) return null;
    const startRow = Math.floor(objectPaletteSelection.startId / tilesetCols);
    const startCol = objectPaletteSelection.startId % tilesetCols;
    const endRow = Math.floor(objectPaletteSelection.endId / tilesetCols);
    const endCol = objectPaletteSelection.endId % tilesetCols;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    return { minRow, maxRow, minCol, maxCol };
  }, [objectPaletteSelection, tilesetCols]);

  const objectSelectionSet = useMemo(() => {
    if (!objectSelectionBounds) return new Set<number>();
    const selected = new Set<number>();
    for (let row = objectSelectionBounds.minRow; row <= objectSelectionBounds.maxRow; row += 1) {
      for (let col = objectSelectionBounds.minCol; col <= objectSelectionBounds.maxCol; col += 1) {
        const tileId = row * tilesetCols + col;
        if (tileId >= 0 && tileId < tilesetCols * tilesetRows) {
          selected.add(tileId);
        }
      }
    }
    return selected;
  }, [objectSelectionBounds, tilesetCols, tilesetRows]);

  const selectionBounds = useMemo(() => {
    if (!stampSelection) return null;
    const minRow = Math.min(stampSelection.startRow, stampSelection.endRow);
    const maxRow = Math.max(stampSelection.startRow, stampSelection.endRow);
    const minCol = Math.min(stampSelection.startCol, stampSelection.endCol);
    const maxCol = Math.max(stampSelection.startCol, stampSelection.endCol);
    return { minRow, maxRow, minCol, maxCol };
  }, [stampSelection]);

  const transformedStampSize = useMemo(() => {
    if (!activeStamp) return null;
    if (stampRotation === 90 || stampRotation === 270) {
      return { width: activeStamp.height, height: activeStamp.width };
    }
    return { width: activeStamp.width, height: activeStamp.height };
  }, [activeStamp, stampRotation]);

  const transformStampCoord = (x: number, y: number, stamp: StampDefinition) => {
    let tx = stampFlipX ? stamp.width - 1 - x : x;
    let ty = stampFlipY ? stamp.height - 1 - y : y;
    if (stampRotation === 90) {
      return { x: ty, y: stamp.width - 1 - tx };
    }
    if (stampRotation === 180) {
      return { x: stamp.width - 1 - tx, y: stamp.height - 1 - ty };
    }
    if (stampRotation === 270) {
      return { x: stamp.height - 1 - ty, y: tx };
    }
    return { x: tx, y: ty };
  };

  const stampPreviewTiles = useMemo(() => {
    if (!activeStamp) return [];
    const tiles: Array<{ x: number; y: number; tileId: number; layerIndex: number }> = [];
    for (let layerIndex = 0; layerIndex < activeStamp.layers.length; layerIndex += 1) {
      const layer = activeStamp.layers[layerIndex];
      for (let x = 0; x < activeStamp.width; x += 1) {
        for (let y = 0; y < activeStamp.height; y += 1) {
          const tileId = layer?.[x]?.[y] ?? -1;
          if (tileId < 0) continue;
          const transformed = transformStampCoord(x, y, activeStamp);
          tiles.push({ x: transformed.x, y: transformed.y, tileId, layerIndex });
        }
      }
    }
    return tiles;
  }, [activeStamp, stampFlipX, stampFlipY, stampRotation]);

  const stampPreviewValid = useMemo(() => {
    if (!hoverInfo || !transformedStampSize) return true;
    return (
      hoverInfo.col + transformedStampSize.width <= MAP_WIDTH &&
      hoverInfo.row + transformedStampSize.height <= MAP_HEIGHT
    );
  }, [hoverInfo, transformedStampSize]);

  function getPlacementRotation(placement: { rotation?: ObjectRotation }) {
    return normalizeRotation(placement.rotation ?? 0);
  }

  function getObjectTileSize(object: ObjectDefinition, rotation: ObjectRotation = 0) {
    const rotated = rotation === 90 || rotation === 270;
    return {
      tileWidth: rotated ? object.tileHeight : object.tileWidth,
      tileHeight: rotated ? object.tileWidth : object.tileHeight,
    };
  }

  function getObjectAnchorOffset(object: ObjectDefinition, rotation: ObjectRotation = 0) {
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
  }

  function getObjectTileBounds(
    object: ObjectDefinition,
    placement: { col: number; row: number; rotation?: ObjectRotation },
  ) {
    const rotation = getPlacementRotation(placement);
    const { tileWidth, tileHeight } = getObjectTileSize(object, rotation);
    const anchor = getObjectAnchorOffset(object, rotation);
    const startCol = placement.col - anchor.x;
    const startRow = placement.row - anchor.y;
    return {
      startCol,
      startRow,
      endCol: startCol + tileWidth - 1,
      endRow: startRow + tileHeight - 1,
    };
  }

  function getObjectPixelBounds(
    object: ObjectDefinition,
    placement: { col: number; row: number; rotation?: ObjectRotation; pixelOffsetX?: number; pixelOffsetY?: number },
  ) {
    const rotation = getPlacementRotation(placement);
    const { tileWidth, tileHeight } = getObjectTileSize(object, rotation);
    const bounds = getObjectTileBounds(object, placement);
    const offsetX = placement.pixelOffsetX ?? 0;
    const offsetY = placement.pixelOffsetY ?? 0;
    return {
      ...bounds,
      left: bounds.startCol * tileSize + offsetX,
      top: bounds.startRow * tileSize + offsetY,
      width: tileWidth * tileSize,
      height: tileHeight * tileSize,
    };
  }

  const objectPreviewBounds = useMemo(() => {
    if (!hoverInfo || !activeObject) return null;
    const usePixelOffset = activeObject.category === 'stamp' && hoverPixelOffset;
    return getObjectPixelBounds(activeObject, {
      col: hoverInfo.col,
      row: hoverInfo.row,
      rotation: activeObjectRotation,
      pixelOffsetX: usePixelOffset ? hoverPixelOffset?.x : undefined,
      pixelOffsetY: usePixelOffset ? hoverPixelOffset?.y : undefined,
    });
  }, [activeObject, hoverInfo, tileSize, activeObjectRotation, hoverPixelOffset]);

  const objectPreviewValid = useMemo(() => {
    if (!objectPreviewBounds) return true;
    return (
      objectPreviewBounds.startCol >= 0 &&
      objectPreviewBounds.startRow >= 0 &&
      objectPreviewBounds.endCol < MAP_WIDTH &&
      objectPreviewBounds.endRow < MAP_HEIGHT
    );
  }, [objectPreviewBounds]);

  const deletePreviewBounds = useMemo(() => {
    if (!deleteModifierActive || !hoverInfo) return null;
    for (let i = placedObjects.length - 1; i >= 0; i -= 1) {
      const placement = placedObjects[i];
      const objectDef = objectsById.get(placement.objectId);
      if (!objectDef) continue;
      const bounds = getObjectTileBounds(objectDef, { ...placement, rotation: getPlacementRotation(placement) });
      if (
        hoverInfo.col >= bounds.startCol &&
        hoverInfo.col <= bounds.endCol &&
        hoverInfo.row >= bounds.startRow &&
        hoverInfo.row <= bounds.endRow
      ) {
        return bounds;
      }
    }
    return null;
  }, [deleteModifierActive, hoverInfo, placedObjects, objectsById]);

  const placedObjectsSorted = useMemo(() => {
    const list = [...placedObjects];
    
    // Helper to determine zLayer: ground (0), stamps (1), other standing objects (2)
    const getZLayer = (objectId: string): number => {
      const def = objectsById.get(objectId);
      if (!def) return 2;
      const category = (def as any).category;
      if (isGroundCategory(category)) return 0;
      if (category === 'stamp') return 1;
      return 2;
    };
    
    list.sort((a, b) => {
      const aDef = objectsById.get(a.objectId);
      const bDef = objectsById.get(b.objectId);
      if (!aDef || !bDef) return 0;
      
      // First sort by zLayer (ground tiles before standing objects)
      const aZLayer = getZLayer(a.objectId);
      const bZLayer = getZLayer(b.objectId);
      if (aZLayer !== bZLayer) return aZLayer - bZLayer;
      
      // Then sort by Y position (endRow)
      const aBounds = getObjectTileBounds(aDef, { ...a, rotation: getPlacementRotation(a) });
      const bBounds = getObjectTileBounds(bDef, { ...b, rotation: getPlacementRotation(b) });
      if (aBounds.endRow !== bBounds.endRow) return aBounds.endRow - bBounds.endRow;
      return aBounds.startCol - bBounds.startCol;
    });
    return list;
  }, [placedObjects, objectsById]);

  const placedObjectsByLayer = useMemo(() => {
    const ground: PlacedObject[] = [];
    const stamps: PlacedObject[] = [];
    const standing: PlacedObject[] = [];
    for (const placement of placedObjectsSorted) {
      const def = objectsById.get(placement.objectId);
      const category = def?.category;
      const isGround = isGroundCategory(category);
      if (isGround) {
        ground.push(placement);
      } else if (category === 'stamp') {
        stamps.push(placement);
      } else {
        standing.push(placement);
      }
    }
    return { ground, stamps, standing };
  }, [placedObjectsSorted, objectsById]);

  const autoCollisionLayer = useMemo(() => {
    const layer = createBlankLayer(MAP_WIDTH, MAP_HEIGHT);
    if (!autoCollisionEnabled) return layer;
    for (const placement of placedObjects) {
      const objectDef = objectsById.get(placement.objectId);
      if (!objectDef) continue;
      if (isGroundCategory(objectDef.category)) continue;
      const bounds = getObjectTileBounds(objectDef, { ...placement, rotation: getPlacementRotation(placement) });
      const startCol = Math.max(0, bounds.startCol);
      const endCol = Math.min(MAP_WIDTH - 1, bounds.endCol);
      const startRow = Math.max(0, bounds.startRow);
      const endRow = Math.min(MAP_HEIGHT - 1, bounds.endRow);
      for (let col = startCol; col <= endCol; col += 1) {
        for (let row = startRow; row <= endRow; row += 1) {
          layer[col][row] = COLLISION_BLOCKED;
        }
      }
    }
    return layer;
  }, [autoCollisionEnabled, placedObjects, objectsById]);

  const effectiveCollisionLayer = useMemo(() => {
    const next = autoCollisionLayer.map((column, col) =>
      column.map((value, row) => {
        const override = collisionLayer[col]?.[row] ?? -1;
        if (override === COLLISION_WALKABLE) return -1;
        if (override !== -1) return COLLISION_BLOCKED;
        return value;
      }),
    );
    return next;
  }, [autoCollisionLayer, collisionLayer]);

  const decalPlacements = useMemo(() => {
    if (!showDecals || !terrainDecalConfig) return [];
    const grassSheet = decalSheets.grassInSand;
    const sandSheet = decalSheets.shoreOnSand;
    const waterSheet = decalSheets.shoreOnWater;
    if (!grassSheet) return [];
    if (terrainDecalConfig.waterId && (!sandSheet || !waterSheet)) return [];

    const { grassId, sandId, waterId } = terrainDecalConfig;
    const grid: number[][] = Array.from({ length: MAP_WIDTH }, () => Array.from({ length: MAP_HEIGHT }, () => 0));

    for (const placement of placedObjects) {
      if (placement.col < 0 || placement.row < 0 || placement.col >= MAP_WIDTH || placement.row >= MAP_HEIGHT) continue;
      if (placement.objectId === grassId) {
        grid[placement.col][placement.row] = 1;
      } else if (placement.objectId === sandId) {
        grid[placement.col][placement.row] = 2;
      } else if (waterId && placement.objectId === waterId) {
        grid[placement.col][placement.row] = 3;
      }
    }

    const placements: Array<{ col: number; row: number; sheet: DecalSheetKey; frameKey: string; offsetX?: number; offsetY?: number }> = [];

    const pickFrame = (sheetKey: DecalSheetKey, prefix: string, col: number, row: number, seed: number) => {
      const sheet = decalSheets[sheetKey];
      if (!sheet) return null;
      const count = sheet.variantCounts[prefix] ?? 0;
      if (count <= 0) return null;
      const index = pickVariantIndex(col, row, seed, count);
      const key = `${prefix}_${index}`;
      if (!sheet.frames[key]) return null;
      return key;
    };

    const addDecal = (
      sheetKey: DecalSheetKey,
      prefix: string,
      col: number,
      row: number,
      seed: number,
      offsetX?: number,
      offsetY?: number,
    ) => {
      const key = pickFrame(sheetKey, prefix, col, row, seed);
      if (!key) return;
      placements.push({ col, row, sheet: sheetKey, frameKey: key, offsetX, offsetY });
    };

    const grassEdge = {
      N: grassSheet.variantCounts['grass_in_sand_edge_N'] ? 'grass_in_sand_edge_N' : 'grass_in_sand_N',
      E: grassSheet.variantCounts['grass_in_sand_edge_E'] ? 'grass_in_sand_edge_E' : 'grass_in_sand_E',
      S: grassSheet.variantCounts['grass_in_sand_edge_S'] ? 'grass_in_sand_edge_S' : 'grass_in_sand_S',
      W: grassSheet.variantCounts['grass_in_sand_edge_W'] ? 'grass_in_sand_edge_W' : 'grass_in_sand_W',
    };
    const grassTuft =
      grassSheet.variantCounts['grass_in_sand_tuft'] ? 'grass_in_sand_tuft' : 'grass_tuft';

    const shoreSandEdge = {
      N: 'shore_on_sand_edge_N',
      E: 'shore_on_sand_edge_E',
      S: 'shore_on_sand_edge_S',
      W: 'shore_on_sand_edge_W',
    };
    const shoreWaterEdge = {
      N: 'shore_on_water_edge_N',
      E: 'shore_on_water_edge_E',
      S: 'shore_on_water_edge_S',
      W: 'shore_on_water_edge_W',
    };

    const cornerOffset = Math.max(3, Math.round(tileSize * 0.2));
    const cornerSoftenChanceSand = 55;
    const cornerSoftenChanceWater = 50;

    for (let col = 0; col < MAP_WIDTH; col += 1) {
      for (let row = 0; row < MAP_HEIGHT; row += 1) {
        const cell = grid[col][row];
        const north = row > 0 ? grid[col][row - 1] : 0;
        const south = row < MAP_HEIGHT - 1 ? grid[col][row + 1] : 0;
        const west = col > 0 ? grid[col - 1][row] : 0;
        const east = col < MAP_WIDTH - 1 ? grid[col + 1][row] : 0;

        if (cell === 2) {
          if (north === 1) addDecal('grassInSand', grassEdge.N, col, row, 1);
          if (east === 1) addDecal('grassInSand', grassEdge.E, col, row, 2);
          if (south === 1) addDecal('grassInSand', grassEdge.S, col, row, 3);
          if (west === 1) addDecal('grassInSand', grassEdge.W, col, row, 4);

          if (north === 1 && east === 1) addDecal('grassInSand', 'grass_in_sand_corner_NE', col, row, 5);
          if (north === 1 && west === 1) addDecal('grassInSand', 'grass_in_sand_corner_NW', col, row, 6);
          if (south === 1 && east === 1) addDecal('grassInSand', 'grass_in_sand_corner_SE', col, row, 7);
          if (south === 1 && west === 1) addDecal('grassInSand', 'grass_in_sand_corner_SW', col, row, 8);

          const nearGrass = north === 1 || south === 1 || east === 1 || west === 1;
          if (nearGrass && (grassSheet.variantCounts[grassTuft] ?? 0) > 0) {
            const roll = stableHash(col, row, 9) % 100;
            if (roll < 18) {
              addDecal('grassInSand', grassTuft, col, row, 10);
            }
          }

          if (waterId && sandSheet) {
            if (north === 3) addDecal('shoreOnSand', shoreSandEdge.N, col, row, 11);
            if (east === 3) addDecal('shoreOnSand', shoreSandEdge.E, col, row, 12);
            if (south === 3) addDecal('shoreOnSand', shoreSandEdge.S, col, row, 13);
            if (west === 3) addDecal('shoreOnSand', shoreSandEdge.W, col, row, 14);

            if (north === 3 && east === 3) addDecal('shoreOnSand', 'shore_on_sand_corner_NE', col, row, 15);
            if (north === 3 && west === 3) addDecal('shoreOnSand', 'shore_on_sand_corner_NW', col, row, 16);
            if (south === 3 && east === 3) addDecal('shoreOnSand', 'shore_on_sand_corner_SE', col, row, 17);
            if (south === 3 && west === 3) addDecal('shoreOnSand', 'shore_on_sand_corner_SW', col, row, 18);

            const nearWater = north === 3 || south === 3 || east === 3 || west === 3;
            if (nearWater && sandSheet.variantCounts['shore_on_sand_tuft'] > 0) {
              const roll = stableHash(col, row, 19) % 100;
              if (roll < 22) {
                addDecal('shoreOnSand', 'shore_on_sand_tuft', col, row, 20);
              }
            }

            if (sandSheet.variantCounts['shore_on_sand_tuft'] > 0) {
              const addCornerTuft = (dx: number, dy: number, seed: number) => {
                const roll = stableHash(col, row, seed) % 100;
                if (roll < cornerSoftenChanceSand) {
                  addDecal('shoreOnSand', 'shore_on_sand_tuft', col, row, seed + 100, dx, dy);
                }
              };
              if (north === 3 && east === 3) addCornerTuft(cornerOffset, -cornerOffset, 31);
              if (north === 3 && west === 3) addCornerTuft(-cornerOffset, -cornerOffset, 32);
              if (south === 3 && east === 3) addCornerTuft(cornerOffset, cornerOffset, 33);
              if (south === 3 && west === 3) addCornerTuft(-cornerOffset, cornerOffset, 34);
            }
          }
        }

        if (cell === 3 && waterId && waterSheet) {
          if (north === 2) addDecal('shoreOnWater', shoreWaterEdge.N, col, row, 21);
          if (east === 2) addDecal('shoreOnWater', shoreWaterEdge.E, col, row, 22);
          if (south === 2) addDecal('shoreOnWater', shoreWaterEdge.S, col, row, 23);
          if (west === 2) addDecal('shoreOnWater', shoreWaterEdge.W, col, row, 24);

          if (north === 2 && east === 2) addDecal('shoreOnWater', 'shore_on_water_corner_NE', col, row, 25);
          if (north === 2 && west === 2) addDecal('shoreOnWater', 'shore_on_water_corner_NW', col, row, 26);
          if (south === 2 && east === 2) addDecal('shoreOnWater', 'shore_on_water_corner_SE', col, row, 27);
          if (south === 2 && west === 2) addDecal('shoreOnWater', 'shore_on_water_corner_SW', col, row, 28);

          const nearSand = north === 2 || south === 2 || east === 2 || west === 2;
          if (nearSand && waterSheet.variantCounts['shore_on_water_tuft'] > 0) {
            const roll = stableHash(col, row, 29) % 100;
            if (roll < 18) {
              addDecal('shoreOnWater', 'shore_on_water_tuft', col, row, 30);
            }
          }

          if (waterSheet.variantCounts['shore_on_water_tuft'] > 0) {
            const addCornerTuft = (dx: number, dy: number, seed: number) => {
              const roll = stableHash(col, row, seed) % 100;
              if (roll < cornerSoftenChanceWater) {
                addDecal('shoreOnWater', 'shore_on_water_tuft', col, row, seed + 100, dx, dy);
              }
            };
            if (north === 2 && east === 2) addCornerTuft(cornerOffset, -cornerOffset, 41);
            if (north === 2 && west === 2) addCornerTuft(-cornerOffset, -cornerOffset, 42);
            if (south === 2 && east === 2) addCornerTuft(cornerOffset, cornerOffset, 43);
            if (south === 2 && west === 2) addCornerTuft(-cornerOffset, cornerOffset, 44);
          }
        }
      }
    }
    return placements;
  }, [showDecals, terrainDecalConfig, decalSheets, placedObjects]);

  const pathBorderTypeByObjectId = useMemo(() => {
    if (pathBorderRules.length === 0) return new Map<string, string>();
    const rulesByKey = new Map<string, string>();
    for (const rule of pathBorderRules) {
      if (!rule.name) continue;
      const base = stripExtension(getBaseName(rule.baseTile));
      if (base) {
        rulesByKey.set(normalizeKey(base), rule.name);
      }
      rulesByKey.set(normalizeKey(rule.name), rule.name);
    }
    const map = new Map<string, string>();
    for (const obj of tilesetObjectsForSet) {
      if (!obj.imagePath) continue;
      if (obj.category !== 'paths' && obj.category !== 'flooring') continue;
      const imageKey = normalizeKey(stripExtension(getBaseName(obj.imagePath)));
      const nameKey = normalizeKey(obj.name);
      const match = rulesByKey.get(imageKey) ?? rulesByKey.get(nameKey);
      if (match) {
        map.set(obj.id, match);
      }
    }
    return map;
  }, [pathBorderRules, tilesetObjectsForSet]);

  const pathBorderPlacements = useMemo(() => {
    if (!showDecals) return [];
    if (!terrainDecalConfig) return [];
    if (pathBorderTypeByObjectId.size === 0) return [];
    if (Object.keys(pathBorderSheets).length === 0) return [];
    const terrainIds = new Set([terrainDecalConfig.grassId, terrainDecalConfig.sandId, terrainDecalConfig.waterId].filter(Boolean));
    if (terrainIds.size === 0) return [];

    const terrainGrid: boolean[][] = Array.from({ length: MAP_WIDTH }, () => Array.from({ length: MAP_HEIGHT }, () => false));
    const pathGrid: (string | null)[][] = Array.from({ length: MAP_WIDTH }, () => Array.from({ length: MAP_HEIGHT }, () => null));

    for (const placement of placedObjects) {
      if (placement.col < 0 || placement.row < 0 || placement.col >= MAP_WIDTH || placement.row >= MAP_HEIGHT) continue;
      if (terrainIds.has(placement.objectId)) {
        terrainGrid[placement.col][placement.row] = true;
        continue;
      }
      const borderType = pathBorderTypeByObjectId.get(placement.objectId);
      if (borderType) {
        pathGrid[placement.col][placement.row] = borderType;
      }
    }

    const placements: Array<{ col: number; row: number; sheetName: string; frameKey: string }> = [];

    for (let col = 0; col < MAP_WIDTH; col += 1) {
      for (let row = 0; row < MAP_HEIGHT; row += 1) {
        const sheetName = pathGrid[col][row];
        if (!sheetName) continue;
        const sheet = pathBorderSheets[sheetName];
        if (!sheet) continue;
        const north = row > 0 ? terrainGrid[col][row - 1] : false;
        const south = row < MAP_HEIGHT - 1 ? terrainGrid[col][row + 1] : false;
        const west = col > 0 ? terrainGrid[col - 1][row] : false;
        const east = col < MAP_WIDTH - 1 ? terrainGrid[col + 1][row] : false;

        if (north) placements.push({ col, row, sheetName, frameKey: `${sheetName}_edge_N` });
        if (east) placements.push({ col, row, sheetName, frameKey: `${sheetName}_edge_E` });
        if (south) placements.push({ col, row, sheetName, frameKey: `${sheetName}_edge_S` });
        if (west) placements.push({ col, row, sheetName, frameKey: `${sheetName}_edge_W` });

        if (north && east) placements.push({ col, row, sheetName, frameKey: `${sheetName}_corner_NE` });
        if (north && west) placements.push({ col, row, sheetName, frameKey: `${sheetName}_corner_NW` });
        if (south && east) placements.push({ col, row, sheetName, frameKey: `${sheetName}_corner_SE` });
        if (south && west) placements.push({ col, row, sheetName, frameKey: `${sheetName}_corner_SW` });
      }
    }
    return placements;
  }, [showDecals, terrainDecalConfig, pathBorderTypeByObjectId, pathBorderSheets, placedObjects]);

  const terrainBarSlots = useMemo(() => {
    const slots: string[] = [];
    const addSlot = (id?: string | null) => {
      if (!id || slots.includes(id)) return;
      slots.push(id);
    };
    addSlot(terrainDecalConfig?.grassId);
    addSlot(terrainDecalConfig?.sandId);
    addSlot(terrainDecalConfig?.waterId ?? null);
    for (const opt of zigzagTerrainOptions) {
      if (slots.length >= 3) break;
      addSlot(opt.id);
    }
    return slots.slice(0, 3);
  }, [terrainDecalConfig, zigzagTerrainOptions]);

  const terrainBarSlotIds = useMemo(
    () => Array.from({ length: QUICKBAR_SLOTS }, (_, index) => terrainBarSlots[index] ?? null),
    [terrainBarSlots],
  );

  const showObjectPanel = activeMode === 'objects' || activeTool === 'object' || objectCaptureMode;
  const showStampPanel = activeMode === 'prefabs' || activeTool === 'stamp' || stampCaptureMode;
  const showTilePanel = activeTool !== 'object' || objectCaptureMode;

  const getTopTileAt = (row: number, col: number) => {
    for (let i = bgLayers.length - 1; i >= 0; i -= 1) {
      const tileId = bgLayers[i]?.[col]?.[row] ?? -1;
      if (tileId >= 0) return { tileId, layerIndex: i };
    }
    return { tileId: -1, layerIndex: -1 };
  };

  const createStampId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const createObjectId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `object-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const createPlacedObjectId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `placed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const saveStampFromSelection = () => {
    if (!selectionBounds) return;
    const width = selectionBounds.maxCol - selectionBounds.minCol + 1;
    const height = selectionBounds.maxRow - selectionBounds.minRow + 1;
    const layers = bgLayers.map((layer) =>
      Array.from({ length: width }, (_, x) =>
        Array.from({ length: height }, (_, y) => layer[selectionBounds.minCol + x]?.[selectionBounds.minRow + y] ?? -1),
      ),
    );
    const name = stampNameDraft.trim() || `Stamp ${tilesetStampsForSet.length + 1}`;
    const newStamp: StampDefinition = {
      id: createStampId(),
      name,
      width,
      height,
      layers,
    };
    setTilesetStamps((prev) => {
      const next = { ...prev };
      const list = [...(next[tileset.id] ?? [])];
      list.push(newStamp);
      next[tileset.id] = list;
      return next;
    });
    setActiveStampId(newStamp.id);
    applyMode('prefabs');
    setStampCaptureMode(false);
    setStampSelection(null);
    setStampNameDraft('');
  };

  const saveObjectFromSelection = () => {
    if (!objectSelectionBounds) return;
    const width = objectSelectionBounds.maxCol - objectSelectionBounds.minCol + 1;
    const height = objectSelectionBounds.maxRow - objectSelectionBounds.minRow + 1;
    const name = objectNameDraft.trim() || `Object ${userObjectsForSet.length + 1}`;
    const newObject: ObjectDefinition = {
      id: createObjectId(),
      name,
      tilesetId: tileset.id,
      tileX: objectSelectionBounds.minCol,
      tileY: objectSelectionBounds.minRow,
      tileWidth: width,
      tileHeight: height,
      anchor: objectAnchor,
      pixelWidth: width * tileSize,
      pixelHeight: height * tileSize,
    };
    setTilesetObjects((prev) => {
      const next = { ...prev };
      const list = [...(next[tileset.id] ?? [])];
      list.push(newObject);
      next[tileset.id] = list;
      return next;
    });
    setActiveObjectId(newObject.id);
    applyMode('objects');
    setObjectCaptureMode(false);
    setObjectPaletteSelection(null);
    setObjectNameDraft('');
  };

  const renameStamp = (stampId: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    setTilesetStamps((prev) => {
      const next = { ...prev };
      const list = (next[tileset.id] ?? []).map((stamp) =>
        stamp.id === stampId ? { ...stamp, name: trimmed } : stamp,
      );
      next[tileset.id] = list;
      return next;
    });
  };

  const renameObject = (objectId: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    setTilesetObjects((prev) => {
      const next = { ...prev };
      const list = (next[tileset.id] ?? []).map((obj) =>
        obj.id === objectId ? { ...obj, name: trimmed } : obj,
      );
      next[tileset.id] = list;
      return next;
    });
  };

  const removeStamp = (stampId: string) => {
    setTilesetStamps((prev) => {
      const next = { ...prev };
      const list = next[tileset.id] ?? [];
      next[tileset.id] = list.filter((stamp) => stamp.id !== stampId);
      return next;
    });
    setActiveStampId((current) => (current === stampId ? null : current));
  };

  const removeObjectDefinition = (objectId: string) => {
    const objectDef = objectsById.get(objectId);
    if (objectDef?.readonly) return;
    setTilesetObjects((prev) => {
      const next = { ...prev };
      const list = next[tileset.id] ?? [];
      next[tileset.id] = list.filter((obj) => obj.id !== objectId);
      return next;
    });
    setPlacedObjects((prev) => prev.filter((placement) => placement.objectId !== objectId));
    setActiveObjectId((current) => (current === objectId ? null : current));
  };

  const getStampPreviewData = (stamp: StampDefinition) => {
    const maxDimension = Math.max(stamp.width, stamp.height, 1);
    const previewTileSize = Math.max(
      6,
      Math.min(tileSize, Math.floor(STAMP_PREVIEW_MAX_SIZE / maxDimension)),
    );
    const scale = previewTileSize / tileSize;
    const tiles: Array<{ x: number; y: number; tileId: number }> = [];
    for (let y = 0; y < stamp.height; y += 1) {
      for (let x = 0; x < stamp.width; x += 1) {
        let tileId = -1;
        for (let layerIndex = stamp.layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
          const candidate = stamp.layers[layerIndex]?.[x]?.[y] ?? -1;
          if (candidate >= 0) {
            tileId = candidate;
            break;
          }
        }
        if (tileId >= 0) tiles.push({ x, y, tileId });
      }
    }
    return {
      tiles,
      previewTileSize,
      scale,
      width: stamp.width * previewTileSize,
      height: stamp.height * previewTileSize,
    };
  };

  const getObjectPreviewData = (object: ObjectDefinition) => {
    const pixelWidth = object.pixelWidth ?? object.tileWidth * tileSize;
    const pixelHeight = object.pixelHeight ?? object.tileHeight * tileSize;
    const maxDimension = Math.max(pixelWidth, pixelHeight, 1);
    const scale = Math.min(1, STAMP_PREVIEW_MAX_SIZE / maxDimension);
    const width = Math.max(1, Math.round(pixelWidth * scale));
    const height = Math.max(1, Math.round(pixelHeight * scale));
    const imageUrl = object.imagePath ? resolveAssetPath(object.imagePath) : tilesetUrl;
    if (object.imagePath) {
      return {
        width,
        height,
        imageUrl,
        backgroundSize: `${width}px ${height}px`,
        backgroundPosition: '0px 0px',
      };
    }
    const scaledTileSize = tileSize * scale;
    return {
      width,
      height,
      imageUrl,
      backgroundSize: `${tilesetCols * scaledTileSize}px ${tilesetRows * scaledTileSize}px`,
      backgroundPosition: `-${object.tileX * scaledTileSize}px -${object.tileY * scaledTileSize}px`,
    };
  };

  const exportStamps = () => {
    const payload = {
      version: 1,
      tilesetId: tileset.id,
      tileDim: tileset.tileDim,
      stamps: tilesetStampsForSet,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stamps_${tileset.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStampImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const importedStamps = Array.isArray(parsed) ? parsed : parsed?.stamps;
        if (!Array.isArray(importedStamps)) {
          alert('No stamps found in this file.');
          return;
        }
        if (parsed?.tileDim && parsed.tileDim !== tileset.tileDim) {
          const proceed = window.confirm(
            `Stamp tile size ${parsed.tileDim} does not match current tileset (${tileset.tileDim}). Import anyway?`,
          );
          if (!proceed) return;
        }
        const sanitized: StampDefinition[] = importedStamps
          .map((stamp: StampDefinition) => {
            if (!stamp || !Array.isArray(stamp.layers)) return null;
            if (!Number.isFinite(stamp.width) || !Number.isFinite(stamp.height)) return null;
            return {
              id: createStampId(),
              name: stamp.name?.trim() ? stamp.name.trim() : 'Imported Stamp',
              width: stamp.width,
              height: stamp.height,
              layers: stamp.layers,
            };
          })
          .filter(Boolean) as StampDefinition[];
        if (sanitized.length === 0) {
          alert('No valid stamps found in this file.');
          return;
        }
        let replace = false;
        if (tilesetStampsForSet.length > 0) {
          replace = window.confirm('Replace existing stamps? Click Cancel to merge.');
        }
        setTilesetStamps((prev) => {
          const next = { ...prev };
          next[tileset.id] = replace ? sanitized : [...(next[tileset.id] ?? []), ...sanitized];
          return next;
        });
        setActiveStampId(sanitized[0]?.id ?? null);
        applyMode('prefabs');
      } catch (error) {
        console.error('Failed to import stamps:', error);
        alert('Invalid stamp JSON.');
      } finally {
        if (stampFileInputRef.current) stampFileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const buildAutoStampsFromMap = (options: AutoStampOptions) => {
    if (!bgLayers.length) return [];
    const minTiles = Math.max(1, Math.floor(options.minTiles));
    const maxWidth = Math.max(1, Math.floor(options.maxWidth));
    const maxHeight = Math.max(1, Math.floor(options.maxHeight));
    const maxStamps = Math.max(1, Math.floor(options.maxStamps));
    const groundCoverage = Math.min(0.95, Math.max(0.4, options.groundCoverage));
    const baseLayer = bgLayers[0] ?? [];
    const baseCounts = new Map<number, number>();
    let totalBaseTiles = 0;
    for (const column of baseLayer) {
      for (const tileId of column) {
        if (tileId < 0) continue;
        totalBaseTiles += 1;
        baseCounts.set(tileId, (baseCounts.get(tileId) ?? 0) + 1);
      }
    }
    const sortedBaseCounts = Array.from(baseCounts.entries()).sort((a, b) => b[1] - a[1]);
    const groundTiles = new Set<number>();
    let covered = 0;
    for (const [tileId, count] of sortedBaseCounts) {
      if (groundTiles.size >= 6) break;
      groundTiles.add(tileId);
      covered += count;
      if (totalBaseTiles > 0 && covered / totalBaseTiles >= groundCoverage) break;
    }

    const visited = Array.from({ length: MAP_WIDTH }, () => Array(MAP_HEIGHT).fill(false));
    const components: Array<{
      minCol: number;
      maxCol: number;
      minRow: number;
      maxRow: number;
      maskCount: number;
      tileInstanceCount: number;
      transparentCount: number;
      overlayCount: number;
      baseForegroundCount: number;
      categoryCounts: Record<TileCategory, number>;
    }> = [];

    const isForegroundAt = (col: number, row: number) => {
      const baseTile = baseLayer?.[col]?.[row] ?? -1;
      const hasBase = baseTile >= 0 && !groundTiles.has(baseTile);
      let hasOverlay = false;
      for (let layerIndex = 1; layerIndex < bgLayers.length; layerIndex += 1) {
        const overlayTile = bgLayers[layerIndex]?.[col]?.[row] ?? -1;
        if (overlayTile >= 0) {
          hasOverlay = true;
          break;
        }
      }
      return hasBase || hasOverlay;
    };

    for (let col = 0; col < MAP_WIDTH; col += 1) {
      for (let row = 0; row < MAP_HEIGHT; row += 1) {
        if (visited[col][row]) continue;
        if (!isForegroundAt(col, row)) continue;
        let minCol = col;
        let maxCol = col;
        let minRow = row;
        let maxRow = row;
        let maskCount = 0;
        let tileInstanceCount = 0;
        let transparentCount = 0;
        let overlayCount = 0;
        let baseForegroundCount = 0;
        const categoryCounts: Record<TileCategory, number> = {
          terrain: 0,
          paths: 0,
          props: 0,
          buildings: 0,
        };
        const stack: Array<[number, number]> = [[col, row]];
        visited[col][row] = true;
        while (stack.length) {
          const [cx, cy] = stack.pop() as [number, number];
          maskCount += 1;
          minCol = Math.min(minCol, cx);
          maxCol = Math.max(maxCol, cx);
          minRow = Math.min(minRow, cy);
          maxRow = Math.max(maxRow, cy);

          const baseTile = baseLayer?.[cx]?.[cy] ?? -1;
          if (baseTile >= 0 && !groundTiles.has(baseTile)) {
            baseForegroundCount += 1;
            tileInstanceCount += 1;
            if (transparentTiles[baseTile]) transparentCount += 1;
            const category = tilesetCategoryAssignments[baseTile];
            if (category) categoryCounts[category] += 1;
          }

          for (let layerIndex = 1; layerIndex < bgLayers.length; layerIndex += 1) {
            const overlayTile = bgLayers[layerIndex]?.[cx]?.[cy] ?? -1;
            if (overlayTile >= 0) {
              overlayCount += 1;
              tileInstanceCount += 1;
              if (transparentTiles[overlayTile]) transparentCount += 1;
              const category = tilesetCategoryAssignments[overlayTile];
              if (category) categoryCounts[category] += 1;
            }
          }

          const neighbors: Array<[number, number]> = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1],
          ];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
            if (visited[nx][ny]) continue;
            if (!isForegroundAt(nx, ny)) continue;
            visited[nx][ny] = true;
            stack.push([nx, ny]);
          }
        }

        const width = maxCol - minCol + 1;
        const height = maxRow - minRow + 1;
        if (maskCount < minTiles) continue;
        if (width > maxWidth || height > maxHeight) continue;

        components.push({
          minCol,
          maxCol,
          minRow,
          maxRow,
          maskCount,
          tileInstanceCount,
          transparentCount,
          overlayCount,
          baseForegroundCount,
          categoryCounts,
        });
      }
    }

    components.sort((a, b) => b.maskCount - a.maskCount);
    const stamps: StampDefinition[] = [];
    let buildingIndex = 1;
    let pathIndex = 1;
    let treeIndex = 1;
    let prefabIndex = 1;

    for (const component of components.slice(0, maxStamps)) {
      const width = component.maxCol - component.minCol + 1;
      const height = component.maxRow - component.minRow + 1;
      const layers = bgLayers.map((layer, layerIndex) =>
        Array.from({ length: width }, (_, x) =>
          Array.from({ length: height }, (_, y) => {
            const tileId = layer[component.minCol + x]?.[component.minRow + y] ?? -1;
            if (layerIndex === 0 && groundTiles.has(tileId)) return -1;
            return tileId;
          }),
        ),
      );

      const transparentRatio =
        component.tileInstanceCount > 0 ? component.transparentCount / component.tileInstanceCount : 0;
      let name = `Prefab ${prefabIndex}`;
      if (component.categoryCounts.buildings > 0) {
        name = `Building ${buildingIndex}`;
        buildingIndex += 1;
      } else if (component.categoryCounts.paths > 0 || (component.overlayCount === 0 && component.baseForegroundCount > 0)) {
        name = `Path ${pathIndex}`;
        pathIndex += 1;
      } else if (transparentRatio > 0.45) {
        name = `Tree Cluster ${treeIndex}`;
        treeIndex += 1;
      } else if (component.categoryCounts.props > 0 || component.overlayCount > 0) {
        name = `Prefab ${prefabIndex}`;
        prefabIndex += 1;
      } else {
        name = `Prefab ${prefabIndex}`;
        prefabIndex += 1;
      }

      stamps.push({
        id: createStampId(),
        name: `Auto ${name}`,
        width,
        height,
        layers,
      });
    }

    return stamps;
  };

  const extractStampsFromMap = () => {
    const stamps = buildAutoStampsFromMap(autoStampOptions);
    if (stamps.length === 0) {
      alert('No suitable stamp regions found on this map.');
      return;
    }
    if (tilesetStampsForSet.length > 0) {
      const confirmed = window.confirm(`Add ${stamps.length} auto stamps to the existing list?`);
      if (!confirmed) return;
    }
    setTilesetStamps((prev) => {
      const next = { ...prev };
      const list = [...(next[tileset.id] ?? []), ...stamps];
      next[tileset.id] = list;
      return next;
    });
    setActiveStampId(stamps[0].id);
    applyMode('prefabs');
    setAutoGeneratedStamps((prev) => ({ ...prev, [tileset.id]: true }));
  };


  const placeStampAt = (row: number, col: number) => {
    if (!activeStamp) return;
    const stampSize = transformedStampSize ?? { width: activeStamp.width, height: activeStamp.height };
    if (col + stampSize.width > MAP_WIDTH || row + stampSize.height > MAP_HEIGHT) {
      return;
    }
    markHistoryDirty();
    setBgLayers((prev) => {
      const next = prev.map((layer) => layer.map((column) => [...column]));
      const layerCount = Math.min(activeStamp.layers.length, next.length);
      for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
        const stampLayer = activeStamp.layers[layerIndex] ?? [];
        for (let x = 0; x < activeStamp.width; x += 1) {
          for (let y = 0; y < activeStamp.height; y += 1) {
            const tileId = stampLayer[x]?.[y] ?? -1;
            if (tileId < 0 && stampSkipEmpty) continue;
            const transformed = transformStampCoord(x, y, activeStamp);
            const targetCol = col + transformed.x;
            const targetRow = row + transformed.y;
            if (targetCol < 0 || targetCol >= MAP_WIDTH || targetRow < 0 || targetRow >= MAP_HEIGHT) {
              continue;
            }
            if (!next[layerIndex]?.[targetCol]) continue;
            next[layerIndex][targetCol][targetRow] = tileId;
          }
        }
      }
      return next;
    });
  };

  const placeObjectAt = (row: number, col: number, options?: { pixelOffsetX?: number; pixelOffsetY?: number }) => {
    if (!activeObject) return;
    const bounds = getObjectTileBounds(activeObject, { col, row, rotation: activeObjectRotation });
    if (
      bounds.startCol < 0 ||
      bounds.startRow < 0 ||
      bounds.endCol >= MAP_WIDTH ||
      bounds.endRow >= MAP_HEIGHT
    ) {
      return;
    }
    const isGroundObject = isGroundCategory((activeObject as any).category);
    const isStampObject = activeObject.category === 'stamp';
    setPlacedObjects((prev) => {
      if (isGroundObject) {
        const allowOverlay = groundOverlayRef.current;
        const hasSame = prev.some((placement) => placement.col === col && placement.row === row && placement.objectId === activeObject.id);
        if (hasSame) return prev;
        const filtered = allowOverlay
          ? prev
          : prev.filter((placement) => {
              if (placement.col !== col || placement.row !== row) return true;
              const objDef = objectsById.get(placement.objectId);
              return !isGroundCategory(objDef?.category);
            });
        markHistoryDirty();
        return [
          ...filtered,
          {
            id: createPlacedObjectId(),
            objectId: activeObject.id,
            col,
            row,
            rotation: activeObjectRotation,
          },
        ];
      }
      markHistoryDirty();
      return [
        ...prev,
        {
          id: createPlacedObjectId(),
          objectId: activeObject.id,
          col,
          row,
          rotation: activeObjectRotation,
          pixelOffsetX: isStampObject ? options?.pixelOffsetX : undefined,
          pixelOffsetY: isStampObject ? options?.pixelOffsetY : undefined,
        },
      ];
    });
  };

  const removeObjectAt = (row: number, col: number) => {
    setPlacedObjects((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        const placement = next[i];
        const objectDef = objectsById.get(placement.objectId);
        if (!objectDef) continue;
        const bounds = getObjectTileBounds(objectDef, { ...placement, rotation: getPlacementRotation(placement) });
        if (col >= bounds.startCol && col <= bounds.endCol && row >= bounds.startRow && row <= bounds.endRow) {
          markHistoryDirty();
          next.splice(i, 1);
          break;
        }
      }
      return next;
    });
  };

  const applyCollisionAt = useCallback(
    (row: number, col: number, mode: 'block' | 'clear' | 'auto') => {
      if (col < 0 || row < 0 || col >= MAP_WIDTH || row >= MAP_HEIGHT) return;
      const nextValue =
        mode === 'block' ? COLLISION_BLOCKED : mode === 'clear' ? COLLISION_WALKABLE : -1;
      setCollisionLayer((prev) => {
        const column = prev[col];
        if (!column) return prev;
        if (column[row] === nextValue) return prev;
        markHistoryDirty();
        const next = prev.map((colValues) => [...colValues]);
        next[col][row] = nextValue;
        return next;
      });
    },
    [markHistoryDirty],
  );

  const applyToolAt = (
    row: number,
    col: number,
    tool: 'brush' | 'eraser' | 'eyedropper' | 'stamp' | 'object',
    options?: { pixelOffsetX?: number; pixelOffsetY?: number },
  ) => {
    if (tool === 'stamp') {
      placeStampAt(row, col);
      return;
    }
    if (tool === 'object') {
      placeObjectAt(row, col, options);
      return;
    }
    if (tool === 'eyedropper') {
      const { tileId, layerIndex } = getTopTileAt(row, col);
      selectTileId(tileId, { layerOverride: layerIndex });
      return;
    }
    const tileIdToPlace = tool === 'eraser' ? -1 : selectedTileId;
    if (tileIdToPlace === null) return;
    setBgLayers((prev) => {
      const targetLayer = prev[activeLayerIndex];
      if (!targetLayer?.[col]) return prev;
      if (targetLayer[col][row] === tileIdToPlace) return prev;
      markHistoryDirty();
      const next = prev.map((layer, layerIndex) => {
        if (layerIndex !== activeLayerIndex) return layer;
        const nextLayer = layer.map((column) => [...column]);
        if (!nextLayer[col]) return layer;
        nextLayer[col][row] = tileIdToPlace;
        return nextLayer;
      });
      return next;
    });
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    row: number,
    col: number,
  ) => {
    event.preventDefault();
    if (event.button !== 0) return;
    if (stampCaptureMode) {
      setStampSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
      setIsStampSelecting(true);
      return;
    }
    const { tileId, layerIndex } = getTopTileAt(row, col);
    setHoverInfo({
      row,
      col,
      tileId,
      tileLayerIndex: layerIndex,
      collisionValue: effectiveCollisionLayer[col]?.[row] ?? -1,
    });
    const tool = activeTool;
    const isStampObject = tool === 'object' && activeObject?.category === 'stamp';
    const pixelOffset = isStampObject ? getPointerPixelOffset(event) : null;
    if (pixelOffset) {
      setHoverPixelOffset(pixelOffset);
    }
    if (tool !== 'eyedropper' || collisionEditMode) {
      beginHistoryCapture();
    }
    if (collisionEditMode) {
      collisionDragRef.current = true;
      setIsPointerDown(true);
      applyCollisionAt(row, col, collisionBrush);
      return;
    }
    const isGroundObject =
      tool === 'object' && activeObject && isGroundCategory((activeObject as any).category);
    const isDeleteModifier = tool === 'object' && (event.ctrlKey || event.metaKey);
    if (isDeleteModifier) {
      deleteDragRef.current = true;
      setIsPointerDown(true);
      removeObjectAt(row, col);
      return;
    }
    groundOverlayRef.current = Boolean(isGroundObject && event.shiftKey);
    dragToolRef.current = tool;
    setIsPointerDown(true);
    applyToolAt(row, col, tool, pixelOffset ? { pixelOffsetX: pixelOffset.x, pixelOffsetY: pixelOffset.y } : undefined);
    if (tool === 'eyedropper' || tool === 'stamp' || (tool === 'object' && !isGroundObject)) {
      dragToolRef.current = null;
      setIsPointerDown(false);
    }
  };

  const handlePointerEnter = (row: number, col: number, event?: ReactPointerEvent<HTMLDivElement>) => {
    if (stampCaptureMode && isStampSelecting) {
      setStampSelection((prev) =>
        prev ? { ...prev, endRow: row, endCol: col } : { startRow: row, startCol: col, endRow: row, endCol: col },
      );
      return;
    }
    if (event && activeTool === 'object' && activeObject?.category === 'stamp') {
      setHoverPixelOffset(getPointerPixelOffset(event));
    }
    const { tileId, layerIndex } = getTopTileAt(row, col);
    const collisionValue = effectiveCollisionLayer[col]?.[row] ?? -1;
    setHoverInfo({ row, col, tileId, tileLayerIndex: layerIndex, collisionValue });
    if (collisionEditMode && isPointerDown && collisionDragRef.current) {
      applyCollisionAt(row, col, collisionBrush);
      return;
    }
    if (isPointerDown && deleteDragRef.current) {
      removeObjectAt(row, col);
      return;
    }
    if (isPointerDown && dragToolRef.current) {
      applyToolAt(row, col, dragToolRef.current);
    }
  };

  const handlePalettePointerDown = (event: ReactPointerEvent<HTMLDivElement>, tileId: number) => {
    if (objectCaptureMode) {
      event.preventDefault();
      setObjectPaletteSelection({ startId: tileId, endId: tileId });
      setIsObjectPaletteSelecting(true);
      return;
    }
    if (!bulkTagMode || paletteMode !== 'all' || activeCategory !== 'all') return;
    event.preventDefault();
    setPaletteSelection({ startId: tileId, endId: tileId });
    setIsPaletteSelecting(true);
  };

  const handlePalettePointerEnter = (tileId: number) => {
    if (objectCaptureMode) {
      if (!isObjectPaletteSelecting) return;
      setObjectPaletteSelection((prev) => (prev ? { ...prev, endId: tileId } : { startId: tileId, endId: tileId }));
      return;
    }
    if (!isPaletteSelecting || !bulkTagMode || paletteMode !== 'all' || activeCategory !== 'all') return;
    setPaletteSelection((prev) => (prev ? { ...prev, endId: tileId } : { startId: tileId, endId: tileId }));
  };

  useEffect(() => {
    const handleModifierKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        setDeleteModifierActive(true);
      }
    };
    const handleModifierKeyUp = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        setDeleteModifierActive(false);
      }
      if (event.key === 'Control' || event.key === 'Meta') {
        setDeleteModifierActive(false);
      }
    };
    const handleBlur = () => {
      setDeleteModifierActive(false);
    };
    window.addEventListener('keydown', handleModifierKeyDown);
    window.addEventListener('keyup', handleModifierKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleModifierKeyDown);
      window.removeEventListener('keyup', handleModifierKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    const handlePointerUp = () => {
      setIsPointerDown(false);
      dragToolRef.current = null;
      groundOverlayRef.current = false;
      deleteDragRef.current = false;
      collisionDragRef.current = false;
      setIsStampSelecting(false);
      setIsPaletteSelecting(false);
      setIsObjectPaletteSelecting(false);
      commitHistoryCapture();
    };
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [commitHistoryCapture]);

  const buildSavePayload = useCallback(
    (): SavedMapPayload => ({
      version: MAP_SAVE_VERSION,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      tileset,
      bgLayers: cloneLayers(bgLayers),
      collisionLayer: cloneLayer(collisionLayer),
      autoCollisionEnabled,
      placedObjects: clonePlacedObjects(placedObjects),
      animatedSprites: [...animatedSprites],
      terrainDecals: terrainDecalConfig ?? null,
    }),
    [animatedSprites, bgLayers, collisionLayer, placedObjects, tileset, terrainDecalConfig, autoCollisionEnabled],
  );

  const applySavedPayload = useCallback((payload: SavedMapPayload) => {
    if (!payload) return;
    if (payload.mapWidth !== MAP_WIDTH || payload.mapHeight !== MAP_HEIGHT) {
      alert(
        `Saved map size ${payload.mapWidth}×${payload.mapHeight} does not match current ${MAP_WIDTH}×${MAP_HEIGHT}.`,
      );
      return;
    }
    setTileset(payload.tileset ?? DEFAULT_TILESET);
    setBgLayers(payload.bgLayers ?? createBlankLayers(DEFAULT_LAYER_COUNT, MAP_WIDTH, MAP_HEIGHT));
    setCollisionLayer(payload.collisionLayer ?? createBlankLayer(MAP_WIDTH, MAP_HEIGHT));
    setAutoCollisionEnabled(payload.autoCollisionEnabled ?? true);
    setPlacedObjects(normalizePlacedObjects(payload.placedObjects ?? []));
    setAnimatedSprites(payload.animatedSprites ?? []);
    if (payload.terrainDecals?.grassId && payload.terrainDecals?.sandId) {
      setDecalGrassId(normalizeLegacyId(payload.terrainDecals.grassId));
      setDecalSandId(normalizeLegacyId(payload.terrainDecals.sandId));
      setDecalWaterId(payload.terrainDecals.waterId ? normalizeLegacyId(payload.terrainDecals.waterId) : null);
    }
    setHistory({ past: [], future: [] });
    pendingHistoryRef.current = null;
    historyDirtyRef.current = false;
    setActiveObjectRotation(0);
  }, []);

  useEffect(() => {
    const normalized = normalizePlacedObjects(placedObjects);
    if (normalized !== placedObjects) {
      setPlacedObjects(normalized);
    }
  }, [placedObjects]);

  const saveMapToLocal = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload = buildSavePayload();
      window.localStorage.setItem(MAP_SAVE_STORAGE_KEY, JSON.stringify(payload));
      alert('Map saved locally.');
    } catch (error) {
      console.error('Failed to save map:', error);
      alert('Failed to save map.');
    }
  }, [buildSavePayload]);

  const loadMapFromLocal = useCallback(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(MAP_SAVE_STORAGE_KEY);
    if (!raw) {
      alert('No saved map found.');
      return;
    }
    const shouldLoad = window.confirm('Load saved map? Unsaved changes will be lost.');
    if (!shouldLoad) return;
    try {
      const parsed = JSON.parse(raw) as SavedMapPayload;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid save data');
      }
      applySavedPayload(parsed);
      alert('Map loaded.');
    } catch (error) {
      console.error('Failed to load map:', error);
      alert('Failed to load map.');
    }
  }, [applySavedPayload]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const key = event.key.toLowerCase();
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && key === 'z' && !event.shiftKey) {
        if (!canUndo) return;
        event.preventDefault();
        undo();
        return;
      }
      if (isMeta && (key === 'y' || (key === 'z' && event.shiftKey))) {
        if (!canRedo) return;
        event.preventDefault();
        redo();
        return;
      }
      if (key === 'r' && activeMode === 'objects' && activeObject) {
        const isGround = isGroundCategory(activeObject.category);
        if (isGround) return;
        event.preventDefault();
        setActiveObjectRotation((prev) => normalizeRotation(prev + (event.shiftKey ? -90 : 90)));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMode, activeObject, canRedo, canUndo, redo, undo]);

  // Export map data
  const exportMap = () => {
    // Construct valid JS content matching data/gentle.js format
    const jsContent = `
export const tilesetpath = "${tilesetUrl}";
export const tiledim = ${tileset.tileDim};
export const screenxtiles = ${MAP_WIDTH};
export const screenytiles = ${MAP_HEIGHT};
export const tilesetpxw = ${tileset.pixelWidth};
export const tilesetpxh = ${tileset.pixelHeight};

export const bgtiles = ${JSON.stringify(bgLayers)};

export const objmap = ${JSON.stringify([effectiveCollisionLayer])};

export const placedobjects = ${JSON.stringify(placedObjects)};

export const animatedsprites = ${JSON.stringify(animatedSprites)};

export const terraindecals = ${terrainDecalConfig ? JSON.stringify(terrainDecalConfig) : 'null'};

export const mapwidth = ${MAP_WIDTH};
export const mapheight = ${MAP_HEIGHT};
`;

    console.log("===== EXPORTED MAP DATA =====");
    const blob = new Blob([jsContent], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gentle.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert("Map exported! Replace 'data/gentle.js' with this file.");
  };



  const filteredObjects = useMemo(() => {
    if (activeMode !== 'objects') return [];
    
    // If we are in "Buildings" sub-cat, only show buildings
    if (activeSubCategory === 'buildings') {
       return tilesetObjectsForSet.filter(obj => obj.category === 'buildings');
    }

    // Otherwise show other props based on activeSubCategory
    return tilesetObjectsForSet.filter(obj => 
        // If category matches activeSubCategory
        (obj.category === activeSubCategory) ||
        // Fallback: if object has no category, maybe show it in 'nature' or 'props'?
        (!obj.category && activeSubCategory === 'nature') 
    );
  }, [tilesetObjectsForSet, activeMode, activeSubCategory]);

  const isPropsSubCategory = PROP_SUBCATEGORIES.includes(activeSubCategory as (typeof PROP_SUBCATEGORIES)[number]);
  const isPathsSubCategory = PATH_SUBCATEGORIES.some((cat) => cat.id === activeSubCategory);
  const isStampSubCategory = activeSubCategory === 'stamp';
  const propSubTabCategories = Array.from(PROP_SUBCATEGORIES);
  const pathSubTabCategories = PATH_SUBCATEGORIES.map((cat) => cat.id);
  const showObjectSubTabs = (isPropsSubCategory || isPathsSubCategory) && !isStampSubCategory;
  const objectSubTabCategories = isPathsSubCategory ? pathSubTabCategories : propSubTabCategories;

  const renderSidebar = () => {
    return (
       <div className="flex-1 min-h-0 relative z-10 w-full h-full pt-6">
         <StardewFrame className="w-full h-full bg-[#8b6b4a] flex flex-col pt-8 pb-4 px-3" style={{ padding: '32px 12px 16px' }}>
           <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar space-y-3">
            
            {/* Tileset Selector Removed */}

            {/* Mode-Specific Content */}
            {activeMode === 'prefabs' ? (
              /* Stamp/Prop Panel */
              <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1 mb-2 justify-center">
                     <button onClick={() => setStampCaptureMode(p => !p)} className={`text-[9px] px-2 py-0.5 border-2 text-[#f3e2b5] rounded uppercase ${stampCaptureMode ? 'bg-[#9c2a2a] border-[#e8d4b0]' : 'bg-[#3b2a21] border-[#6d4c30] hover:bg-[#5a4030]'}`}>
                       {stampCaptureMode ? 'Creating...' : 'New Stamp'}
                     </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                   {tilesetStampsForSet.map(stamp => (
                      <button 
                        key={stamp.id} 
                        onClick={() => { setActiveStampId(stamp.id); applyMode('prefabs'); }}
                        className={`p-1 bg-[#3b2a21] rounded border-2 text-center group relative ${activeStampId === stamp.id ? 'border-[#ffd93d]' : 'border-[#5a4030] hover:border-[#8b6b4a]'}`}
                      >
                         <span className="text-[8px] text-[#f3e2b5] block truncate">{stamp.name}</span>
                         <div className="absolute top-0 right-0 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[8px] text-red-300 cursor-pointer" onClick={(e) => { e.stopPropagation(); removeStamp(stamp.id); }}>x</span>
                         </div>
                      </button>
                   ))}
                  </div>
              </div>
            ) : activeMode === 'objects' ? (
              /* Object Panel with Sub-Category Tabs */
              <div className="flex flex-col gap-2">
                   {/* Sub-Category Tabs */}
                   {activeSubCategory !== 'buildings' && (isPropsSubCategory || isPathsSubCategory) && (
                       <div className="flex flex-wrap gap-1 mb-2 px-1">
                          {(isPathsSubCategory ? PATH_SUBCATEGORIES : PROP_SUBCATEGORIES).map(cat => (
                             <button
                                key={typeof cat === 'string' ? cat : cat.id}
                                onClick={() => setActiveSubCategory(typeof cat === 'string' ? cat : cat.id)}
                                className={`flex-1 text-[8px] py-1 border-b-2 uppercase tracking-tight transition-colors ${
                                    activeSubCategory === (typeof cat === 'string' ? cat : cat.id) 
                                    ? 'text-[#f3e2b5] border-[#ffd93d] font-bold' 
                                    : 'text-[#a88b6a] border-transparent hover:text-[#d4b078]'
                                }`}
                             >
                                {typeof cat === 'string' ? cat : cat.label}
                             </button>
                          ))}
                       </div>
                   )}

                   <div className="flex flex-wrap gap-1 mb-2 justify-center">
                     {activeSubCategory !== 'buildings' && (
                        <button onClick={() => setObjectCaptureMode(p => !p)} className={`text-[9px] px-2 py-0.5 border-2 text-[#f3e2b5] rounded uppercase ${objectCaptureMode ? 'bg-[#9c2a2a] border-[#e8d4b0]' : 'bg-[#3b2a21] border-[#6d4c30] hover:bg-[#5a4030]'}`}>
                            {objectCaptureMode ? 'Creating...' : 'New Object'}
                        </button>
                     )}
                  </div>

                   <div className="grid grid-cols-3 gap-2">
                      {filteredObjects.length === 0 && (
                          <div className="col-span-3 text-center text-[9px] text-[#f3e2b5]/50 py-4 italic">
                              No {activeSubCategory} found.
                          </div>
                      )}
                      
                      {filteredObjects.map(obj => {
                         const preview = getObjectPreviewData(obj);
                         return (
                           <div key={obj.id} 
                                onClick={() => selectObjectId(obj.id)}
                                className={`aspect-square bg-[#3b2a21] rounded border-2 relative cursor-pointer group flex items-center justify-center overflow-hidden ${activeObjectId === obj.id ? 'border-[#ffd93d] shadow-[0_0_8px_#ffd93d]' : 'border-[#5a4030] hover:border-[#8b6b4a]'}`}
                           >
                               <div 
                                  className="bg-no-repeat shrink-0"
                                  style={{
                                      width: preview.width,
                                      height: preview.height,
                                      backgroundImage: `url(${preview.imageUrl})`,
                                      backgroundPosition: preview.backgroundPosition,
                                      backgroundSize: preview.backgroundSize,
                                      imageRendering: 'pixelated'
                                  }}
                               />
                               <span
                                       className="absolute bottom-0 w-full text-center text-[7px] font-bold uppercase tracking-tight py-0.5 truncate px-1"
                                       style={{
                                         background: 'linear-gradient(180deg, rgba(139,90,43,0.85) 0%, rgba(90,56,37,0.95) 100%)',
                                         color: '#f4e0c0',
                                         textShadow: '0 1px 1px rgba(0,0,0,0.5)',
                                         borderTop: '1px solid rgba(244,224,192,0.3)'
                                       }}
                                       title={obj.name}
                                     >{obj.name}</span>
                           </div>
                         );
                      })}
                   </div>
              </div>
            ) : (
              /* Terrain / Path Panel (Tile Grid) */
              <div className="flex flex-col gap-2">
                 <div className="grid gap-[3px] auto-rows-auto" style={{ gridTemplateColumns: `repeat(3, 1fr)` }}>
                    {paletteTileIds.map(tileId => {
                       const { sx, sy } = getTilePos(tileId);
                       const isSelected = selectedTileId === tileId;
                        return (
                          <div
                            key={tileId}
                            onClick={() => selectTileId(tileId)}
                            className={`cursor-pointer relative hover:brightness-110 active:scale-95 transition-transform ${isSelected ? 'z-10 ring-2 ring-[#ffd93d]' : ''}`}
                            style={{
                              width: '100%',
                              paddingBottom: '100%',
                            }}
                          >
                             <div className="absolute inset-0" style={{
                              backgroundImage: `url(${tilesetUrl})`,
                              backgroundPosition: `-${sx}px -${sy}px`,
                              backgroundSize: `${tilesetCols * tileSize}px ${tilesetRows * tileSize}px`,
                              imageRendering: 'pixelated'
                             }} />
                          </div>
                        );
                    })}
                 </div>
              </div>
            )}
           </div>
         </StardewFrame>
       </div>
    );
  };

  /* -------------------------------------------------------------------------
   * RENDER: Right Panel (Options)
   * ----------------------------------------------------------------------- */
  /* -------------------------------------------------------------------------
   * RENDER: Right Panel (Options)
   * ----------------------------------------------------------------------- */
  const renderRightPanel = () => {
    return (
       <div className="col-start-3 row-span-3 flex flex-col gap-4 h-full pt-10 pb-4"> 
          {/* Options Panel */}
          <StardewFrame className="flex-none p-4 pb-6">
              <div className="flex flex-col gap-4">
                 
                 <label className="flex items-center gap-3 cursor-pointer group hover:brightness-110 transition-all">
                    <StardewCheckbox 
                      label="COLLISION" 
                      checked={showCollision} 
                      onChange={setShowCollision}
                    />
                 </label>

                 <label className="flex items-center gap-3 cursor-pointer group hover:brightness-110 transition-all">
                    <StardewCheckbox 
                      label="AUTO COLLISION" 
                      checked={autoCollisionEnabled} 
                      onChange={setAutoCollisionEnabled}
                    />
                 </label>

                 <label className="flex items-center gap-3 cursor-pointer group hover:brightness-110 transition-all">
                    <StardewCheckbox 
                      label="EDIT COLLISION" 
                      checked={collisionEditMode} 
                      onChange={(checked) => setCollisionEditMode(checked)}
                    />
                 </label>

                 {collisionEditMode && (
                   <div className="flex items-center gap-2">
                     <button
                       onClick={() => setCollisionBrush('block')}
                       className={`text-[9px] px-2 py-1 rounded border ${
                         collisionBrush === 'block'
                           ? 'bg-red-600 text-white border-red-800'
                           : 'bg-[#3b2a21] text-[#f3e2b5] border-[#6d4c30]'
                       }`}
                     >
                       BLOCK
                     </button>
                     <button
                       onClick={() => setCollisionBrush('clear')}
                       className={`text-[9px] px-2 py-1 rounded border ${
                         collisionBrush === 'clear'
                           ? 'bg-green-600 text-white border-green-800'
                           : 'bg-[#3b2a21] text-[#f3e2b5] border-[#6d4c30]'
                       }`}
                     >
                       CLEAR
                     </button>
                     <button
                       onClick={() => setCollisionBrush('auto')}
                       className={`text-[9px] px-2 py-1 rounded border ${
                         collisionBrush === 'auto'
                           ? 'bg-[#8b6b4a] text-white border-[#5a4030]'
                           : 'bg-[#3b2a21] text-[#f3e2b5] border-[#6d4c30]'
                       }`}
                       title="Reset to auto-collision"
                     >
                       AUTO
                     </button>
                   </div>
                 )}

                 <label className="flex items-center gap-3 cursor-pointer group hover:brightness-110 transition-all">
                    <StardewCheckbox 
                      label="OBJECTS" 
                      checked={activeMode === 'objects'} 
                      onChange={() => applyMode('objects')}
                    />
                 </label>

                 <label className="flex items-center gap-3 cursor-pointer group hover:brightness-110 transition-all">
                     <StardewCheckbox 
                      label="MUSIC" 
                      checked={true} 
                      onChange={() => {}}
                    />
                 </label>
                 
                 <label className="flex items-center gap-3 cursor-pointer group hover:brightness-110 transition-all">
                     <StardewCheckbox 
                      label="MUSIC" 
                      checked={false} 
                      onChange={() => {}}
                      className="opacity-50"
                    />
                 </label>
              </div>
          </StardewFrame>
       </div>
    );
  };

  /* -------------------------------------------------------------------------
   * RENDER: Bottom Bar
   * ----------------------------------------------------------------------- */
  const renderBottomBar = () => {
    return (
        <div className="col-start-2 row-start-3 flex gap-4 h-[84px] p-2">
             <StardewFrame className="flex-1 flex items-center justify-center px-4">
                <div className="flex gap-2 p-3 bg-[#e8d4b0] rounded-lg border-2 border-[#d4b078] shadow-[inset_0_2px_6px_rgba(0,0,0,0.3)]">
                  {terrainBarSlotIds.map((objectId, index) => {
                    if (!objectId) {
                      return (
                        <div
                          key={`terrain-slot-empty-${index}`}
                          className="relative w-12 h-12 border-2 border-[#c2a075] bg-[#d9bd92] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] rounded-sm flex items-center justify-center"
                        >
                          <span className="text-[#a88b6a]/50 text-xl">+</span>
                          <span className="absolute -top-2 -left-2 w-5 h-5 flex items-center justify-center bg-[#8b6b4a] text-[#f6e2b0] text-[10px] font-bold border border-[#5a4030] rounded-full z-10">{index + 1}</span>
                        </div>
                      );
                    }
                    const objDef = objectsById.get(objectId);
                    if (!objDef) {
                      return (
                        <div
                          key={`terrain-slot-missing-${index}`}
                          className="relative w-12 h-12 border-2 border-[#c2a075] bg-[#d9bd92] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] rounded-sm flex items-center justify-center"
                        >
                          <span className="absolute -top-2 -left-2 w-5 h-5 flex items-center justify-center bg-[#8b6b4a] text-[#f6e2b0] text-[10px] font-bold border border-[#5a4030] rounded-full z-10">{index + 1}</span>
                        </div>
                      );
                    }
                    const preview = getObjectPreviewData(objDef);
                    const isActive = activeObjectId === objectId;
                    return (
                      <button
                        key={`terrain-slot-${index}`}
                        onClick={() => selectObjectId(objectId)}
                        className={`relative w-12 h-12 border-2 rounded-sm active:scale-95 transition-all group ${
                          isActive
                            ? 'border-[#ffd93d] bg-[#fdf6d8] shadow-[0_0_8px_#ffd93d] z-10'
                            : 'border-[#8b6b4a] bg-[#f9eaca] hover:border-[#a88b6a]'
                        }`}
                      >
                        <span
                          className={`absolute -top-2 -left-2 w-5 h-5 flex items-center justify-center text-[10px] font-bold border rounded-full z-20 ${
                            isActive ? 'bg-[#ffd93d] text-[#5a4030] border-[#e8b030]' : 'bg-[#8b6b4a] text-[#f6e2b0] border-[#5a4030]'
                          }`}
                        >
                          {index + 1}
                        </span>
                        <div
                          className="w-full h-full bg-no-repeat bg-center"
                          style={{
                            backgroundImage: `url(${preview.imageUrl})`,
                            backgroundPosition: preview.backgroundPosition,
                            backgroundSize: preview.backgroundSize,
                            transform: 'scale(0.8)',
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
             </StardewFrame>
        </div>
    );
  };

  const renderPlacedObject = (placement: PlacedObject) => {
    const objectDef = objectsById.get(placement.objectId);
    if (!objectDef) return null;
    const placementRotation = getPlacementRotation(placement);
    const bounds = getObjectPixelBounds(objectDef, { ...placement, rotation: placementRotation });
    const objectImageUrl = objectDef.imagePath ? resolveAssetPath(objectDef.imagePath) : tilesetUrl;

    const isGroundTile = isGroundCategory((objectDef as any).category);
    const baseWidth = isGroundTile
      ? tileSize
      : (objectDef.pixelWidth ?? objectDef.tileWidth * tileSize) * ((objectDef as any).scale ?? 1.0);
    const baseHeight = isGroundTile
      ? tileSize
      : (objectDef.pixelHeight ?? objectDef.tileHeight * tileSize) * ((objectDef as any).scale ?? 1.0);
    const rotatedSize = getRotatedSize(baseWidth, baseHeight, placementRotation);

    let objectOffsetX = 0;
    let objectOffsetY = 0;
    if (!isGroundTile && objectDef.imagePath) {
      if (objectDef.anchor === 'bottom-left') {
        objectOffsetY = Math.max(0, bounds.height - rotatedSize.height);
      } else if (objectDef.anchor === 'center') {
        objectOffsetX = Math.max(0, Math.round((bounds.width - rotatedSize.width) / 2));
        objectOffsetY = Math.max(0, Math.round((bounds.height - rotatedSize.height) / 2));
      }
    }
    return (
      <div
        key={placement.id}
        className="absolute"
        style={{
          left: bounds.left + objectOffsetX,
          top: bounds.top + objectOffsetY,
          width: rotatedSize.width,
          height: rotatedSize.height,
        }}
      >
        <div
          className="absolute"
          style={{
            width: baseWidth,
            height: baseHeight,
            backgroundImage: `url(${objectImageUrl})`,
            backgroundPosition: objectDef.imagePath
              ? '0px 0px'
              : `-${objectDef.tileX * tileSize}px -${objectDef.tileY * tileSize}px`,
            backgroundSize: objectDef.imagePath
              ? `${baseWidth}px ${baseHeight}px`
              : `${tilesetCols * tileSize}px ${tilesetRows * tileSize}px`,
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            transformOrigin: 'top left',
            transform: getRotationTransform(baseWidth, baseHeight, placementRotation),
          }}
        />
      </div>
    );
  };

  const renderCanvas = () => {
      // Dimensions of the scaled content
      const contentWidth = mapPixelWidth * canvasScale;
      const contentHeight = mapPixelHeight * canvasScale;

      return (
        <div className="w-full h-full relative bg-[#a89070]">
          <div
            ref={canvasContainerRef}
            className="absolute inset-0 overflow-auto custom-scrollbar"
          >
            {/* Main Map Content - Wrapped to fix scroll bounds for scaled content */}
            <div style={{ width: contentWidth, height: contentHeight, position: 'relative', margin: 'auto' }}>
              <div
                  className="relative origin-top-left"
                  style={{ 
                      width: mapPixelWidth, 
                      height: mapPixelHeight,
                      transform: `scale(${canvasScale})`,
                      transformOrigin: 'top left',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                  }}
              >
             {/* Base Layers */}
             <div className="absolute inset-0">
               <div className="absolute inset-0 bg-[#d4c4a0] shadow-xl rounded" />
               <div
                 className="absolute inset-0"
                 onContextMenu={(event) => event.preventDefault()}
                 style={{
                   display: 'grid',
                   gridTemplateColumns: `repeat(${MAP_WIDTH}, ${tileSize}px)`,
                   touchAction: 'none',
                 }}
               >
                  {/* BG Layers */}
                   {Array.from({ length: MAP_HEIGHT }).map((_, rIndex) =>
                    Array.from({ length: MAP_WIDTH }).map((_, cIndex) => (
                      <div
                        key={`${rIndex}-${cIndex}`}
                        onPointerDown={(event) => handlePointerDown(event, rIndex, cIndex)}
                        onPointerEnter={(event) => handlePointerEnter(rIndex, cIndex, event)}
                        onPointerMove={(event) => {
                          if (activeTool === 'object' && activeObject?.category === 'stamp') {
                            setHoverPixelOffset(getPointerPixelOffset(event));
                          }
                          if (isPointerDown) handlePointerEnter(rIndex, cIndex, event);
                        }}
                        className="cursor-crosshair relative transition-all duration-75 hover:ring-2 hover:ring-[#ffd93d] hover:shadow-[0_0_8px_rgba(255,217,61,0.5)]"
                        style={{ width: tileSize, height: tileSize }}
                      >
                         {bgLayers.map((layer, layerIndex) => {
                           const tileId = layer[cIndex]?.[rIndex] ?? -1;
                           if (tileId < 0 || !tilesetLoaded) return null;
                           const pos = getTilePos(tileId);
                           return (
                             <div
                               key={`layer-${layerIndex}`}
                               className="absolute inset-0"
                               style={{
                                 backgroundImage: `url(${tilesetUrl})`,
                                 backgroundPosition: `-${pos.sx}px -${pos.sy}px`,
                                 backgroundSize: `${tilesetCols * tileSize}px ${tilesetRows * tileSize}px`,
                               }}
                             />
                           );
                       })}
                     </div>
                    ))
                  )}
               </div>
               <div
                 className="absolute inset-0 pointer-events-none rounded"
                 style={{
                   backgroundImage:
                     'linear-gradient(to right, var(--stardew-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--stardew-grid) 1px, transparent 1px)',
                   backgroundSize: `${tileSize}px ${tileSize}px`,
                   backgroundPosition: '0 0',
                 }}
               />
               <div className="absolute inset-0 pointer-events-none border-2 border-[#8b6b4a] rounded" />
             </div>

             {/* Placed Objects */}
             {showObjects &&
               (placedObjectsByLayer.ground.length > 0 ||
                 placedObjectsByLayer.stamps.length > 0 ||
                 placedObjectsByLayer.standing.length > 0) && (
                <div className="absolute inset-0 pointer-events-none">
                  {placedObjectsByLayer.ground.map((placement) => renderPlacedObject(placement))}
                  {showDecals && (decalPlacements.length > 0 || pathBorderPlacements.length > 0) && (
                    <div className="absolute inset-0 pointer-events-none">
                      {decalPlacements.map((decal, index) => {
                        const sheet = decalSheets[decal.sheet];
                        const frame = sheet?.frames[decal.frameKey];
                        if (!frame) return null;
                        const scale = tileSize / sheet.meta.tileSize;
                        const backgroundSize = `${sheet.meta.width * scale}px ${sheet.meta.height * scale}px`;
                        return (
                          <div
                            key={`decal-${decal.col}-${decal.row}-${decal.sheet}-${decal.frameKey}-${index}`}
                            className="absolute"
                            style={{
                              left: decal.col * tileSize + (decal.offsetX ?? 0),
                              top: decal.row * tileSize + (decal.offsetY ?? 0),
                              width: tileSize,
                              height: tileSize,
                              backgroundImage: `url(${sheet.url})`,
                              backgroundPosition: `-${frame.x * scale}px -${frame.y * scale}px`,
                              backgroundSize,
                              backgroundRepeat: 'no-repeat',
                              imageRendering: 'pixelated',
                            }}
                          />
                        );
                      })}
                      {pathBorderPlacements.map((decal, index) => {
                        const sheet = pathBorderSheets[decal.sheetName];
                        const frame = sheet?.frames[decal.frameKey];
                        if (!frame) return null;
                        const scale = tileSize / sheet.meta.tileSize;
                        const backgroundSize = `${sheet.meta.width * scale}px ${sheet.meta.height * scale}px`;
                        return (
                          <div
                            key={`path-border-${decal.col}-${decal.row}-${decal.sheetName}-${decal.frameKey}-${index}`}
                            className="absolute"
                            style={{
                              left: decal.col * tileSize,
                              top: decal.row * tileSize,
                              width: tileSize,
                              height: tileSize,
                              backgroundImage: `url(${sheet.url})`,
                              backgroundPosition: `-${frame.x * scale}px -${frame.y * scale}px`,
                              backgroundSize,
                              backgroundRepeat: 'no-repeat',
                              imageRendering: 'pixelated',
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                  {placedObjectsByLayer.stamps.map((placement) => renderPlacedObject(placement))}
                  {placedObjectsByLayer.standing.map((placement) => renderPlacedObject(placement))}
                </div>
             )}

             {/* Animated Sprites */}
             {showAnimatedSprites && (
                <div className="absolute inset-0 pointer-events-none">
                  <Stage width={mapPixelWidth} height={mapPixelHeight} options={{ backgroundAlpha: 0, antialias: false }}>
                    <PixiAnimatedSpritesLayer sprites={animatedSprites} />
                  </Stage>
                </div>
             )}

             {/* Collision Overlay */}
             {showCollision && (
                <div className="absolute inset-0 pointer-events-none" style={{ display: 'grid', gridTemplateColumns: `repeat(${MAP_WIDTH}, ${tileSize}px)` }}>
                  {Array.from({ length: MAP_HEIGHT }).map((_, rIndex) =>
                    Array.from({ length: MAP_WIDTH }).map((_, cIndex) => {
                      const overrideValue = collisionLayer[cIndex]?.[rIndex] ?? -1;
                      const effectiveValue = effectiveCollisionLayer[cIndex]?.[rIndex] ?? -1;
                      const overlayClass =
                        overrideValue === COLLISION_WALKABLE
                          ? 'bg-green-500/30'
                          : overrideValue !== -1
                            ? 'bg-red-500/45'
                            : effectiveValue !== -1
                              ? 'bg-red-500/20'
                              : '';
                      return <div key={`collision-${rIndex}-${cIndex}`} className={overlayClass} style={{ width: tileSize, height: tileSize }} />;
                    })
                  )}
                </div>
             )}

             {/* Stamp Preview */}
             {activeTool === 'stamp' && activeStamp && hoverInfo && transformedStampSize && tilesetLoaded && (
                <div className="absolute pointer-events-none" style={{ left: hoverInfo.col * tileSize, top: hoverInfo.row * tileSize, width: transformedStampSize.width * tileSize, height: transformedStampSize.height * tileSize, opacity: stampPreviewValid ? 0.7 : 0.4 }}>
                   {stampPreviewTiles.map((tile, index) => {
                     const pos = getTilePos(tile.tileId);
                     return (
                       <div key={`stamp-preview-${index}`} className="absolute" style={{ left: tile.x * tileSize, top: tile.y * tileSize, width: tileSize, height: tileSize, backgroundImage: `url(${tilesetUrl})`, backgroundPosition: `-${pos.sx}px -${pos.sy}px`, backgroundSize: `${tilesetCols * tileSize}px ${tilesetRows * tileSize}px` }} />
                     );
                   })}
                   <div className={`absolute inset-0 border-2 ${stampPreviewValid ? 'border-cyan-300/70' : 'border-red-400/70'}`} />
                </div>
             )}

             {/* Object Preview */}
             {activeTool === 'object' && activeObject && hoverInfo && (tilesetLoaded || activeObject.imagePath) && objectPreviewBounds && (() => {
                const isGroundTile = isGroundCategory((activeObject as any).category);
                const previewScale =
                  !isGroundTile && activeObject.imagePath
                    ? ((activeObject as any).scale ?? 1.0)
                    : 1.0;
                const baseWidth = isGroundTile
                  ? tileSize
                  : (activeObject.pixelWidth ?? activeObject.tileWidth * tileSize) * previewScale;
                const baseHeight = isGroundTile
                  ? tileSize
                  : (activeObject.pixelHeight ?? activeObject.tileHeight * tileSize) * previewScale;
                const rotatedSize = getRotatedSize(baseWidth, baseHeight, activeObjectRotation);
                const previewWidth = objectPreviewBounds.width;
                const previewHeight = objectPreviewBounds.height;
                let previewOffsetX = 0;
                let previewOffsetY = 0;
                if (!isGroundTile) {
                  if (activeObject.anchor === 'bottom-left') {
                    previewOffsetY = Math.max(0, objectPreviewBounds.height - rotatedSize.height);
                  } else if (activeObject.anchor === 'center') {
                    previewOffsetX = Math.max(0, Math.round((objectPreviewBounds.width - rotatedSize.width) / 2));
                    previewOffsetY = Math.max(0, Math.round((objectPreviewBounds.height - rotatedSize.height) / 2));
                  }
                }

                return (
                  <div className="absolute pointer-events-none" style={{ left: objectPreviewBounds.left, top: objectPreviewBounds.top, width: previewWidth, height: previewHeight, opacity: objectPreviewValid ? 0.7 : 0.4 }}>
                     <div
                       className="absolute"
                       style={{
                         top: previewOffsetY,
                         left: previewOffsetX,
                         width: baseWidth,
                         height: baseHeight,
                         backgroundImage: `url(${activeObject.imagePath ? resolveAssetPath(activeObject.imagePath) : tilesetUrl})`,
                         backgroundPosition: activeObject.imagePath ? `0px 0px` : `-${activeObject.tileX * tileSize}px -${activeObject.tileY * tileSize}px`,
                         backgroundSize: activeObject.imagePath ? `${baseWidth}px ${baseHeight}px` : `${tilesetCols * tileSize}px ${tilesetRows * tileSize}px`,
                         backgroundRepeat: 'no-repeat',
                         transformOrigin: 'top left',
                         transform: getRotationTransform(baseWidth, baseHeight, activeObjectRotation),
                         imageRendering: 'pixelated',
                       }}
                     />
                     <div className={`absolute inset-0 border-2 ${objectPreviewValid ? 'border-emerald-300/70' : 'border-red-400/70'}`} />
                  </div>
                );
             })()}

             {/* Delete Preview */}
             {deleteModifierActive && activeTool === 'object' && hoverInfo && (() => {
               const bounds = deletePreviewBounds ?? {
                 startCol: hoverInfo.col,
                 startRow: hoverInfo.row,
                 endCol: hoverInfo.col,
                 endRow: hoverInfo.row,
               };
               const width = (bounds.endCol - bounds.startCol + 1) * tileSize;
               const height = (bounds.endRow - bounds.startRow + 1) * tileSize;
               return (
                 <div
                   className="absolute pointer-events-none"
                   style={{
                     left: bounds.startCol * tileSize,
                     top: bounds.startRow * tileSize,
                     width,
                     height,
                     backgroundColor: 'rgba(248, 113, 113, 0.18)',
                     border: '2px solid rgba(248, 113, 113, 0.9)',
                     boxSizing: 'border-box',
                   }}
                 />
               );
             })()}

             {/* Selection Bounds */}
             {selectionBounds && (
                <div className="absolute pointer-events-none border-2 border-cyan-400/80 bg-cyan-400/10" style={{ left: selectionBounds.minCol * tileSize, top: selectionBounds.minRow * tileSize, width: (selectionBounds.maxCol - selectionBounds.minCol + 1) * tileSize, height: (selectionBounds.maxRow - selectionBounds.minRow + 1) * tileSize }} />
             )}
              </div>
            </div>
          </div>
          
           {/* Hover Info Overlay - Floating in Canvas Area */}
           <div className="fixed bottom-4 right-4 bg-black/80 text-[#f6e2b0] px-3 py-1.5 rounded-md pointer-events-none z-50 text-[10px] border border-[#5a4030] shadow shadow-black/50 font-mono">
              {hoverInfo
                ? `X ${hoverInfo.col} Y ${hoverInfo.row} | ${activeToolLabel}`
                : `Hover to inspect | ${activeToolLabel}`}
           </div>

           {/* Zoom Controls - Floating in Canvas Corner */}
           <div
             className={`absolute bottom-3 right-3 z-40 ${
               isZoomCollapsed
                 ? 'bg-[#3b2a21]/95 px-2 py-1.5 rounded-lg border border-[#6d4c30] shadow-lg'
                 : 'flex items-center gap-2 bg-[#3b2a21]/95 px-3 py-2 rounded-lg border-2 border-[#6d4c30] shadow-lg'
             }`}
           >
             {isZoomCollapsed ? (
               <button
                 onClick={() => setIsZoomCollapsed(false)}
                 className="text-[9px] text-[#f3e2b5] px-2 py-1 rounded bg-[#5a4030] border border-[#6d4c30] hover:bg-[#6d4c30]"
                 title="Show zoom controls"
               >
                 ZOOM {Math.round(canvasScale * 100)}%
               </button>
             ) : (
               <>
                 <button 
                    onClick={() => setCanvasScale(s => Math.max(0.3, s - 0.1))}
                    className="w-7 h-7 bg-[#5a4030] border border-[#6d4c30] rounded text-[#f3e2b5] text-sm font-bold hover:bg-[#6d4c30] active:scale-95"
                    title="Zoom Out"
                 >−</button>
                 <span className="text-[#ffd93d] text-[10px] font-display font-bold min-w-[40px] text-center">
                    {Math.round(canvasScale * 100)}%
                 </span>
                 <button 
                    onClick={() => setCanvasScale(s => Math.min(2.0, s + 0.1))}
                    className="w-7 h-7 bg-[#5a4030] border border-[#6d4c30] rounded text-[#f3e2b5] text-sm font-bold hover:bg-[#6d4c30] active:scale-95"
                    title="Zoom In"
                 >+</button>
                 <button 
                    onClick={() => setCanvasScale(0.7)}
                    className="text-[8px] text-[#a88b6a] hover:text-[#f3e2b5] ml-1"
                    title="Reset Zoom"
                 >↺</button>
                 <button
                    onClick={() => setIsZoomCollapsed(true)}
                    className="text-[8px] text-[#a88b6a] hover:text-[#f3e2b5] ml-1"
                    title="Minimize"
                 >
                   MIN
                 </button>
               </>
             )}
           </div>
        </div>
    );
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#fdf6d8] font-display">
      <div 
        className="relative select-none p-3 w-full h-full"
        style={{
          display: 'grid',
          gridTemplateColumns: '360px 1fr 260px',
          gridTemplateRows: 'auto 1fr auto',
          gridTemplateAreas: `
            "sidebar-left header header"
            "sidebar-left main sidebar-right"
            "sidebar-left footer sidebar-right"
          `,
          gap: '10px',
          imageRendering: 'pixelated',
        }}
      >
        {/* --------------------------------------------------------------------------
            Zone: Sidebar Left (Tiles)
            Area: sidebar-left
            Responsive Width: min-content (based on children)
           -------------------------------------------------------------------------- */}
         {/* Hanging Sign - Positioned absolutely relative to the scaled grid container, at the top left column */}
         <div className="absolute top-0 left-[180px] z-30 pointer-events-none" style={{ transform: 'translateX(-50%) translateY(-25%)' }}>
             <HangingSign scale={0.9} />
         </div>

        {/* --------------------------------------------------------------------------
            Zone: Sidebar Left (Tiles)
            Area: sidebar-left
            Responsive Width: min-content (based on children)
           -------------------------------------------------------------------------- */}
        <div style={{ gridArea: 'sidebar-left' }} className="relative h-full pt-4 min-w-[260px] min-h-[450px]">
            {/* Hanging Sign removed from here */}
            
            <StardewFrame className="w-full h-full flex flex-col pt-4 pb-2 px-2" >
               <div className="flex-1 min-h-0 w-full h-full overflow-hidden rounded-sm relative"> {/* overflow-hidden to clip content to frame */}
                 <div className="absolute inset-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-2 py-1"> {/* Scroll container with padding */}
                  {/* Tileset Selector removed - no longer needed */}

                  {/* Mode Content */}
                  {activeMode === 'prefabs' ? (
                     <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1 mb-2 justify-center">
                           <button onClick={() => setStampCaptureMode(p => !p)} className={`text-[9px] px-2 py-0.5 border-2 text-[#f3e2b5] rounded uppercase ${stampCaptureMode ? 'bg-[#9c2a2a] border-[#e8d4b0]' : 'bg-[#3b2a21] border-[#6d4c30] hover:bg-[#5a4030]'}`}>
                             {stampCaptureMode ? 'Creating...' : 'New Stamp'}
                           </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                         {tilesetStampsForSet.map(stamp => (
                            <button 
                              key={stamp.id} 
                              onClick={() => { setActiveStampId(stamp.id); applyMode('prefabs'); }}
                              className={`p-1 bg-[#3b2a21] rounded border-2 text-center group relative ${activeStampId === stamp.id ? 'border-[#ffd93d]' : 'border-[#5a4030] hover:border-[#8b6b4a]'}`}
                            >
                               <span className="text-[8px] text-[#f3e2b5] block truncate">{stamp.name}</span>
                               <div className="absolute top-0 right-0 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-[8px] text-red-300 cursor-pointer" onClick={(e) => { e.stopPropagation(); removeStamp(stamp.id); }}>x</span>
                               </div>
                            </button>
                         ))}
                        </div>
                    </div>
                  ) : activeMode === 'objects' ? (
                    <div className="flex flex-col gap-2">
                         {/* Sub-Category Tabs (Stardew style) */}
                         {showObjectSubTabs && (
                             <StardewSubTabGroup
                                categories={objectSubTabCategories}
                                activeCategory={activeSubCategory}
                                onSelect={setActiveSubCategory}
                                className="mb-3"
                             />
                         )}

                         {/* Objects Grid - use filteredObjects which filters by activeSubCategory */}
                         <div className="grid grid-cols-3 gap-2">
                            {filteredObjects.length === 0 && (
                                <div className="col-span-3 text-center text-[9px] text-[#f3e2b5]/50 py-4 italic space-y-2">
                                    <div>No {activeSubCategory} found.</div>
                                    {tilesetObjectsForSet.length === 0 && (
                                      <button
                                        onClick={reloadAssets}
                                        className="px-2 py-1 text-[8px] uppercase tracking-wide border border-[#6d4c30] bg-[#3b2a21] text-[#f3e2b5] rounded hover:bg-[#5a4030]"
                                      >
                                        Refresh Assets
                                      </button>
                                    )}
                                </div>
                            )}
                            {filteredObjects.map(obj => {
                               const preview = getObjectPreviewData(obj);
                               return (
                                 <div key={obj.id} 
                                      onClick={() => selectObjectId(obj.id)}
                                      className={`aspect-square bg-[#3b2a21] rounded border-2 relative cursor-pointer group flex items-center justify-center overflow-hidden ${activeObjectId === obj.id ? 'border-[#ffd93d] shadow-[0_0_8px_#ffd93d]' : 'border-[#5a4030] hover:border-[#8b6b4a]'}`}
                                 >
                                     <div 
                                        className="bg-no-repeat shrink-0"
                                        style={{
                                            width: preview.width,
                                            height: preview.height,
                                            backgroundImage: `url(${preview.imageUrl})`,
                                            backgroundPosition: preview.backgroundPosition,
                                            backgroundSize: preview.backgroundSize,
                                            imageRendering: 'pixelated'
                                        }}
                                     />
                                     <span
                                       className="absolute bottom-0 w-full text-center text-[7px] font-bold uppercase tracking-tight py-0.5 truncate px-1"
                                       style={{
                                         background: 'linear-gradient(180deg, rgba(139,90,43,0.85) 0%, rgba(90,56,37,0.95) 100%)',
                                         color: '#f4e0c0',
                                         textShadow: '0 1px 1px rgba(0,0,0,0.5)',
                                         borderTop: '1px solid rgba(244,224,192,0.3)'
                                       }}
                                       title={obj.name}
                                     >{obj.name}</span>
                                 </div>
                               );
                            })}
                         </div>
                    </div>
                  ) : (
                    <div className="grid gap-[3px] auto-rows-auto" style={{ gridTemplateColumns: `repeat(3, 1fr)` }}>
                        {paletteTileIds.map(tileId => {
                           const { sx, sy } = getTilePos(tileId);
                           const isSelected = selectedTileId === tileId;
                            return (
                              <div
                                key={tileId}
                                onClick={() => selectTileId(tileId)}
                                className={`cursor-pointer relative hover:brightness-110 active:scale-95 transition-transform ${isSelected ? 'z-10 ring-2 ring-[#ffd93d]' : ''}`}
                                style={{
                                  width: '100%',
                                  paddingBottom: '100%',
                                }}
                              >
                                 <div className="absolute inset-0" style={{
                                  backgroundImage: `url(${tilesetUrl})`,
                                  backgroundPosition: `-${sx}px -${sy}px`,
                                  backgroundSize: `${tilesetCols * tileSize}px ${tilesetRows * tileSize}px`,
                                  imageRendering: 'pixelated'
                                 }} />
                              </div>
                            );
                        })}
                     </div>
                  )}
               </div>
               </div>
            </StardewFrame>
        </div>

        {/* --------------------------------------------------------------------------
            Zone: Header (Tabs + Tools)
            Area: header
            Responsive Height: auto (min 56px)
           -------------------------------------------------------------------------- */}
         <div style={{ gridArea: 'header' }} className="flex h-[108px] gap-[10px] justify-center">
             {/* Header Left: Tabs (Fit to content) */}
             <div className="h-full w-fit"> 
                 <StardewFrame className="flex items-center px-4 h-full" >
                     <div className="flex items-center gap-2">
                         {[
                           { label: 'PATHS', mode: 'objects' as EditorMode, category: null, subCategory: 'paths' },
                           { label: 'PROPS', mode: 'objects' as EditorMode, category: null, subCategory: 'nature' },
                           { label: 'BUILDINGS', mode: 'objects' as EditorMode, category: null, subCategory: 'buildings' },
                           { label: 'STAMP', mode: 'objects' as EditorMode, category: null, subCategory: 'stamp' }
                         ].map((tab) => (
                            <div key={tab.label} className="relative">
                                <StardewTab
                                  label={tab.label}
                                  isActive={
                                    tab.label === 'PATHS'
                                      ? activeMode === tab.mode && PATH_SUBCATEGORIES.some((cat) => cat.id === activeSubCategory)
                                      : tab.label === 'PROPS'
                                        ? activeMode === tab.mode && PROP_SUBCATEGORIES.includes(activeSubCategory as (typeof PROP_SUBCATEGORIES)[number])
                                        : tab.subCategory
                                          ? activeMode === tab.mode && activeSubCategory === tab.subCategory
                                          : activeMode === tab.mode
                                  }
                                  onClick={() => {
                                     applyMode(tab.mode);
                                     if (tab.category) setActiveCategory(tab.category);
                                     if (tab.subCategory) setActiveSubCategory(tab.subCategory);
                                  }}
                                  className="flex-shrink-0 scale-90 origin-center"
                                />
                            </div>
                         ))}
                     </div>
                 </StardewFrame>
             </div>

             {/* Tools removed for simplified workflow */}
        </div>

        {/* --------------------------------------------------------------------------
            Zone: Main (Canvas)
            Area: main
           -------------------------------------------------------------------------- */}
        <div style={{ gridArea: 'main' }} className="relative flex items-center justify-center min-h-0 min-w-0">
            <div className="w-full h-full border-[6px] border-[#6d4c30] bg-[#d4c4a0] shadow-[inset_0_0_20px_rgba(0,0,0,0.2)] rounded overflow-hidden flex ring-4 ring-[#8b6b4a]">
                {renderCanvas()}
            </div>
        </div>

        {/* --------------------------------------------------------------------------
            Zone: Footer (Terrain Bar)
            Area: footer
            Responsive Height: auto
           -------------------------------------------------------------------------- */}
        <div style={{ gridArea: 'footer' }} className="flex justify-center items-center h-[100px]">
             <div className="h-full">
                <StardewFrame className="h-full flex items-center justify-center px-4" >
                     <div className="flex gap-2 items-center">
                        {terrainBarSlotIds.map((objectId, index) => {
                           const objDef = objectId ? objectsById.get(objectId) : null;
                           const isActive = Boolean(objectId && activeObjectId === objectId);
                           const content = objDef
                             ? (() => {
                                 const preview = getObjectPreviewData(objDef);
                                 return (
                                   <div
                                     className="bg-no-repeat bg-center"
                                     style={{
                                       width: `${objDef.pixelWidth ?? objDef.tileWidth * tileSize}px`,
                                       height: `${objDef.pixelHeight ?? objDef.tileHeight * tileSize}px`,
                                       backgroundImage: `url(${preview.imageUrl})`,
                                       backgroundPosition: preview.backgroundPosition,
                                       backgroundSize: preview.backgroundSize,
                                       transform: 'scale(0.8)',
                                       imageRendering: 'pixelated',
                                     }}
                                   />
                                 );
                               })()
                             : null;

                           return (
                             <button
                               key={`terrain-slot-${index}`}
                               onClick={() => {
                                 if (objectId) selectObjectId(objectId);
                               }}
                               className={`relative w-10 h-10 flex items-center justify-center transition-all duration-75 rounded-sm overflow-hidden group ${
                                 isActive
                                   ? 'bg-[#e8d4b0] border-2 border-[#6d4c30] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] scale-105 z-10'
                                   : 'bg-[#e8d4b0] border-2 border-[#8b6b4a] shadow-[inset_0_-2px_0_rgba(0,0,0,0.2),0_2px_0_rgba(0,0,0,0.2)] hover:bg-[#ffe6b5] hover:-translate-y-0.5'
                               }`}
                             >
                               <span
                                 className={`absolute -top-1 -left-1 w-3 h-3 flex items-center justify-center text-[7px] font-bold border rounded-full z-20 ${
                                   isActive ? 'bg-[#ffd93d] text-[#5a4030] border-[#e8b030]' : 'bg-[#8b6b4a] text-[#f6e2b0] border-[#5a4030]'
                                 }`}
                               >
                                 {index + 1}
                               </span>

                               {!content && (
                                 <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                                   <div className="w-6 h-6 rounded-full border-2 border-[#d4b078]" />
                                 </div>
                               )}

                               {content}
                             </button>
                           );
                        })}
                     </div>
                </StardewFrame>
             </div>
        </div>

        {/* --------------------------------------------------------------------------
            Zone: Sidebar Right (Settings)
            Area: sidebar-right
            Responsive Width: min-content or fixed
           -------------------------------------------------------------------------- */}
        <div style={{ gridArea: 'sidebar-right', alignSelf: 'start' }} className="flex flex-col pt-4 pl-2 w-full">
            <StardewFrame className="p-3 w-full">
                <div className="flex flex-col gap-1">
                   <button 
                        onClick={saveMapToLocal}
                        className="bg-[#3b6b8f] border-2 border-[#26445c] text-[#f3e2b5] px-2 py-1.5 rounded text-[9px] hover:bg-[#4a7ca5] active:scale-95 shadow-sm font-display uppercase tracking-wider w-full flex items-center justify-center gap-1"
                    >
                        💾 <span>SAVE</span>
                    </button>
                    <button 
                        onClick={loadMapFromLocal}
                        className="bg-[#2f587a] border-2 border-[#1f3b52] text-[#f3e2b5] px-2 py-1.5 rounded text-[9px] hover:bg-[#3d6c94] active:scale-95 shadow-sm font-display uppercase tracking-wider w-full flex items-center justify-center gap-1"
                    >
                        📂 <span>LOAD</span>
                    </button>
                   {/* Export Button */}
                    <button 
                        onClick={exportMap}
                        className="bg-[#4a8f4a] border-2 border-[#2e5e2e] text-[#f3e2b5] px-2 py-1.5 rounded text-[9px] hover:bg-[#5aa85a] active:scale-95 shadow-sm font-display uppercase tracking-wider w-full flex items-center justify-center gap-1"
                    >
                        💾 <span>EXPORT</span>
                    </button>
                    <button
                        onClick={reloadAssets}
                        className="bg-[#6b5a3b] border-2 border-[#4a3b26] text-[#f3e2b5] px-2 py-1.5 rounded text-[9px] hover:bg-[#7a6845] active:scale-95 shadow-sm font-display uppercase tracking-wider w-full flex items-center justify-center gap-1"
                    >
                        🔄 <span>REFRESH</span>
                    </button>
                    <button 
                        onClick={() => setShowAssetSlicer(true)}
                        className="bg-[#8b4513] border-2 border-[#5d2f0d] text-[#f3e2b5] px-2 py-1.5 rounded text-[9px] hover:bg-[#a0522d] active:scale-95 shadow-sm font-display uppercase tracking-wider w-full flex items-center justify-center gap-1"
                    >
                        ✂️ <span>SLICE</span>
                    </button>
                    
                   <div className="h-px bg-[#6d4c30] w-full my-1.5 opacity-30" />

                   <label className="flex items-center gap-1 cursor-pointer hover:brightness-110 transition-all" title="Show/Hide collision overlay">
                      <StardewCheckbox 
                        label="COLLISION" 
                        checked={showCollision} 
                        onChange={setShowCollision}
                        className="scale-70 origin-left"
                      />
                   </label>

                   <label className="flex items-center gap-1 cursor-pointer hover:brightness-110 transition-all" title="Auto collision from objects">
                      <StardewCheckbox 
                        label="AUTO" 
                        checked={autoCollisionEnabled} 
                        onChange={setAutoCollisionEnabled}
                        className="scale-70 origin-left"
                      />
                   </label>

                   <label className="flex items-center gap-1 cursor-pointer hover:brightness-110 transition-all" title="Edit collision overrides">
                      <StardewCheckbox 
                        label="EDIT" 
                        checked={collisionEditMode} 
                        onChange={(checked) => setCollisionEditMode(checked)}
                        className="scale-70 origin-left"
                      />
                   </label>

                   {collisionEditMode && (
                     <div className="flex items-center gap-1 justify-center">
                       <button
                         onClick={() => setCollisionBrush('block')}
                         className={`text-[7px] px-1.5 py-0.5 rounded border ${
                           collisionBrush === 'block'
                             ? 'bg-red-600 text-white border-red-800'
                             : 'bg-[#3b2a21] text-[#f3e2b5] border-[#6d4c30]'
                         }`}
                       >
                         BLOCK
                       </button>
                       <button
                         onClick={() => setCollisionBrush('clear')}
                         className={`text-[7px] px-1.5 py-0.5 rounded border ${
                           collisionBrush === 'clear'
                             ? 'bg-green-600 text-white border-green-800'
                             : 'bg-[#3b2a21] text-[#f3e2b5] border-[#6d4c30]'
                         }`}
                       >
                         CLEAR
                       </button>
                       <button
                         onClick={() => setCollisionBrush('auto')}
                         className={`text-[7px] px-1.5 py-0.5 rounded border ${
                           collisionBrush === 'auto'
                             ? 'bg-[#8b6b4a] text-white border-[#5a4030]'
                             : 'bg-[#3b2a21] text-[#f3e2b5] border-[#6d4c30]'
                         }`}
                         title="Reset to auto-collision"
                       >
                         AUTO
                       </button>
                     </div>
                   )}

                   <label className="flex items-center gap-1 cursor-pointer hover:brightness-110 transition-all" title="Show/Hide placed objects">
                      <StardewCheckbox 
                        label="OBJ" 
                        checked={showObjects} 
                        onChange={setShowObjects}
                        className="scale-70 origin-left"
                      />
                   </label>

                   <label className="flex items-center gap-1 cursor-pointer hover:brightness-110 transition-all" title="Show/Hide animated sprites">
                       <StardewCheckbox 
                        label="ANIM" 
                        checked={showAnimatedSprites} 
                        onChange={setShowAnimatedSprites}
                        className="scale-70 origin-left"
                      />
                   </label>
                   
                   <div className="text-[#8b6b4a] text-[8px] font-display text-center">
                      {MAP_WIDTH}×{MAP_HEIGHT}
                   </div>
                 </div>
            </StardewFrame>
        </div>

      </div>
      {showAssetSlicer && (
        <AssetSlicer onClose={() => setShowAssetSlicer(false)} />
      )}
    </div>
  );
};

export default MapEditor;
