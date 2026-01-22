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

const MAP_WIDTH = DEFAULT_MAP_WIDTH;
const MAP_HEIGHT = DEFAULT_MAP_HEIGHT;

// Collision layer tile meanings
const COLLISION_WALKABLE = 367;
const COLLISION_BLOCKED = 458;
const RECENT_TILES_MAX = 12;
const RECENT_OBJECTS_MAX = 8;
const DEFAULT_LAYER_COUNT = 2;
const QUICKBAR_SLOTS = 8;

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

type ObjectAnchor = 'top-left' | 'bottom-left';

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
};

type EditorSnapshot = {
  bgLayers: number[][][];
  collisionLayer: number[][];
  placedObjects: PlacedObject[];
};

type AutoStampOptions = {
  minTiles: number;
  maxWidth: number;
  maxHeight: number;
  maxStamps: number;
  groundCoverage: number;
};

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
  const [packLoadError, setPackLoadError] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [showCollision, setShowCollision] = useState(true); // Toggle collision overlay
  const [showAnimatedSprites, setShowAnimatedSprites] = useState(true);
  const [showObjects, setShowObjects] = useState(true); // Toggle placed objects visibility
  const [canvasScale, setCanvasScale] = useState(0.7); // Zoom level (0.3 - 2.0)
  const [tilesetLoaded, setTilesetLoaded] = useState(false);
  const [activeTool, setActiveTool] = useState<'brush' | 'eraser' | 'eyedropper' | 'stamp' | 'object'>('brush');
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [activeMode, setActiveMode] = useState<EditorMode>('objects');
  const [activeSubCategory, setActiveSubCategory] = useState<string>('terrain'); // Default to terrain
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
  const [recentTiles, setRecentTiles] = useState<number[]>([]);
  const [recentObjects, setRecentObjects] = useState<string[]>([]);
  const [animatedSprites, setAnimatedSprites] = useState<MapAnimatedSprite[]>(() => INITIAL_ANIMATED_SPRITES);
  const [tilesetLoadError, setTilesetLoadError] = useState<string | null>(null);
  const [transparentTiles, setTransparentTiles] = useState<boolean[]>([]);
  const [hiddenTiles, setHiddenTiles] = useState<boolean[]>([]);
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
  const tilesetRef = useRef<HTMLImageElement | null>(null);
  const dragToolRef = useRef<'brush' | 'eraser' | 'eyedropper' | 'stamp' | 'object' | null>(null);
  const stampFileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

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
          const assetsResponse = await fetch(assetsUrl);
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
  }, []);

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

  // Pack switching effect removed - we now load all objects from all packs

  const tileSize = tileset.tileDim;
  const tilesetCols = Math.floor(tileset.pixelWidth / tileSize);
  const tilesetRows = Math.floor(tileset.pixelHeight / tileSize);
  const mapPixelWidth = MAP_WIDTH * tileSize;
  const mapPixelHeight = MAP_HEIGHT * tileSize;
  const tilesetUrl = useMemo(() => resolveAssetPath(tileset.path), [tileset.path]);

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
        const isGroundTile = source.category === 'terrain' || source.category === 'paths';
        const tileWidth = isGroundTile ? 1 : Math.max(1, Math.ceil(pixelWidth / tileSize));
        const tileHeight = isGroundTile ? 1 : Math.max(1, Math.ceil(pixelHeight / tileSize));

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
      ? `Object${activeObject ? `: ${activeObject.name}` : ''}`
      : `${activeTool.charAt(0).toUpperCase()}${activeTool.slice(1)}`;

  const objectsById = useMemo(() => {
    const map = new Map<string, ObjectDefinition>();
    for (const obj of tilesetObjectsForSet) {
      map.set(obj.id, obj);
    }
    return map;
  }, [tilesetObjectsForSet]);

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

  const resetMap = (options?: { animated: MapAnimatedSprite[] }) => {
    setBgLayers(createBlankLayers(DEFAULT_LAYER_COUNT, MAP_WIDTH, MAP_HEIGHT));
    setCollisionLayer(createBlankLayer(MAP_WIDTH, MAP_HEIGHT));
    setAnimatedSprites(options?.animated ?? []);
    setPlacedObjects([]);
    setRecentTiles([]);
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

  const pushRecentTile = (tileId: number) => {
    if (tileId < 0) return;
    setRecentTiles((prev) => {
      const filtered = prev.filter((id) => id !== tileId);
      return [tileId, ...filtered].slice(0, RECENT_TILES_MAX);
    });
  };

  const pushRecentObject = (objectId: string) => {
    if (!objectId) return;
    setRecentObjects((prev) => {
      const filtered = prev.filter((id) => id !== objectId);
      return [objectId, ...filtered].slice(0, RECENT_OBJECTS_MAX);
    });
  };

  const selectObjectId = (objectId: string) => {
    if (!objectId) return;
    setActiveObjectId(objectId);
    setActiveTool('object');
    setActiveMode('objects');
    pushRecentObject(objectId);
  };

  const selectTileId = (tileId: number, options?: { layerOverride?: number }) => {
    setSelectedTileId(tileId);
    if (tileId >= 0) {
      pushRecentTile(tileId);
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

  const objectPreviewBounds = useMemo(() => {
    if (!hoverInfo || !activeObject) return null;
    return getObjectPixelBounds(activeObject, { col: hoverInfo.col, row: hoverInfo.row });
  }, [activeObject, hoverInfo, tileSize]);

  const objectPreviewValid = useMemo(() => {
    if (!objectPreviewBounds) return true;
    return (
      objectPreviewBounds.startCol >= 0 &&
      objectPreviewBounds.startRow >= 0 &&
      objectPreviewBounds.endCol < MAP_WIDTH &&
      objectPreviewBounds.endRow < MAP_HEIGHT
    );
  }, [objectPreviewBounds]);

  const placedObjectsSorted = useMemo(() => {
    const list = [...placedObjects];
    
    // Helper to determine zLayer: terrain/paths are ground (0), other objects are standing (1)
    const getZLayer = (objectId: string): number => {
      const def = objectsById.get(objectId);
      if (!def) return 1;
      const category = (def as any).category;
      // Ground layer objects (render first/below)
      if (category === 'terrain' || category === 'paths') return 0;
      // Standing objects (render after/above)
      return 1;
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
      const aBounds = getObjectTileBounds(aDef, a);
      const bBounds = getObjectTileBounds(bDef, b);
      if (aBounds.endRow !== bBounds.endRow) return aBounds.endRow - bBounds.endRow;
      return aBounds.startCol - bBounds.startCol;
    });
    return list;
  }, [placedObjects, objectsById]);

  const quickbarTileSlots = useMemo(
    () => Array.from({ length: QUICKBAR_SLOTS }, (_, index) => recentTiles[index] ?? null),
    [recentTiles],
  );

  const quickbarObjectSlots = useMemo(() => {
    const available = recentObjects.filter((id) => objectsById.has(id));
    return Array.from({ length: QUICKBAR_SLOTS }, (_, index) => available[index] ?? null);
  }, [recentObjects, objectsById]);

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

  function getObjectAnchorOffset(object: ObjectDefinition) {
    if (object.anchor === 'bottom-left') {
      return { x: 0, y: object.tileHeight - 1 };
    }
    return { x: 0, y: 0 };
  }

  function getObjectTileBounds(object: ObjectDefinition, placement: { col: number; row: number }) {
    const anchor = getObjectAnchorOffset(object);
    const startCol = placement.col - anchor.x;
    const startRow = placement.row - anchor.y;
    return {
      startCol,
      startRow,
      endCol: startCol + object.tileWidth - 1,
      endRow: startRow + object.tileHeight - 1,
    };
  }

  function getObjectPixelBounds(object: ObjectDefinition, placement: { col: number; row: number }) {
    const bounds = getObjectTileBounds(object, placement);
    return {
      ...bounds,
      left: bounds.startCol * tileSize,
      top: bounds.startRow * tileSize,
      width: object.tileWidth * tileSize,
      height: object.tileHeight * tileSize,
    };
  }

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

  const placeObjectAt = (row: number, col: number) => {
    if (!activeObject) return;
    const bounds = getObjectTileBounds(activeObject, { col, row });
    if (
      bounds.startCol < 0 ||
      bounds.startRow < 0 ||
      bounds.endCol >= MAP_WIDTH ||
      bounds.endRow >= MAP_HEIGHT
    ) {
      return;
    }
    const isGroundObject =
      (activeObject as any).category === 'terrain' || (activeObject as any).category === 'paths';
    setPlacedObjects((prev) => {
      if (isGroundObject) {
        const hasSame = prev.some((placement) => placement.col === col && placement.row === row && placement.objectId === activeObject.id);
        if (hasSame) return prev;
        const filtered = prev.filter((placement) => {
          if (placement.col !== col || placement.row !== row) return true;
          const objDef = objectsById.get(placement.objectId);
          const isGround = objDef?.category === 'terrain' || objDef?.category === 'paths';
          return !isGround;
        });
        markHistoryDirty();
        return [
          ...filtered,
          {
            id: createPlacedObjectId(),
            objectId: activeObject.id,
            col,
            row,
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
        },
      ];
    });
    pushRecentObject(activeObject.id);
  };

  const removeObjectAt = (row: number, col: number) => {
    setPlacedObjects((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        const placement = next[i];
        const objectDef = objectsById.get(placement.objectId);
        if (!objectDef) continue;
        const bounds = getObjectTileBounds(objectDef, placement);
        if (col >= bounds.startCol && col <= bounds.endCol && row >= bounds.startRow && row <= bounds.endRow) {
          markHistoryDirty();
          next.splice(i, 1);
          break;
        }
      }
      return next;
    });
  };

  const applyToolAt = (
    row: number,
    col: number,
    tool: 'brush' | 'eraser' | 'eyedropper' | 'stamp' | 'object',
  ) => {
    if (tool === 'stamp') {
      placeStampAt(row, col);
      return;
    }
    if (tool === 'object') {
      placeObjectAt(row, col);
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
    if (tileIdToPlace >= 0) {
      pushRecentTile(tileIdToPlace);
    }
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
      collisionValue: collisionLayer[col]?.[row] ?? -1,
    });
    const tool = activeTool;
    if (tool !== 'eyedropper') {
      beginHistoryCapture();
    }
    const isGroundObject =
      tool === 'object' &&
      activeObject &&
      ((activeObject as any).category === 'terrain' || (activeObject as any).category === 'paths');
    dragToolRef.current = tool;
    setIsPointerDown(true);
    applyToolAt(row, col, tool);
    if (tool === 'eyedropper' || tool === 'stamp' || (tool === 'object' && !isGroundObject)) {
      dragToolRef.current = null;
      setIsPointerDown(false);
    }
  };

  const handlePointerEnter = (row: number, col: number) => {
    if (stampCaptureMode && isStampSelecting) {
      setStampSelection((prev) =>
        prev ? { ...prev, endRow: row, endCol: col } : { startRow: row, startCol: col, endRow: row, endCol: col },
      );
      return;
    }
    const { tileId, layerIndex } = getTopTileAt(row, col);
    const collisionValue = collisionLayer[col]?.[row] ?? -1;
    setHoverInfo({ row, col, tileId, tileLayerIndex: layerIndex, collisionValue });
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
    const handlePointerUp = () => {
      setIsPointerDown(false);
      dragToolRef.current = null;
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Export map data
  const exportMap = () => {
    // Generate object map from placements
    const objectMapLayer = createBlankLayer(MAP_WIDTH, MAP_HEIGHT);
    // This is a simplified reconstruction; ideally we'd track the full object layer state
    // But since placedObjects tracks explicit objects, we might want to rely on that.
    // However, the engine expects `objmap` to be a dense int array for collision/rendering if used that way.
    // In gentle.js, `objmap` is [ [row...] ].
    // Let's assume we just want to export the collision layer as the object map for now,
    // or if we have distinct object layers, export those.
    // The current state has `collisionLayer`.
    
    // Construct valid JS content matching data/gentle.js format
    const jsContent = `
export const tilesetpath = "${tilesetUrl}";
export const tiledim = ${tileset.tileDim};
export const screenxtiles = ${MAP_WIDTH};
export const screenytiles = ${MAP_HEIGHT};
export const tilesetpxw = ${tileset.pixelWidth};
export const tilesetpxh = ${tileset.pixelHeight};

export const bgtiles = ${JSON.stringify(bgLayers)};

export const objmap = ${JSON.stringify([collisionLayer])};

export const animatedsprites = ${JSON.stringify(animatedSprites)};

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
                   {/* Sub-Category Tabs (Only if not buildings) */}
                   {activeSubCategory !== 'buildings' && (
                       <div className="flex flex-wrap gap-1 mb-2 px-1">
                          {['nature', 'furniture', 'decorations', 'fences'].map(cat => (
                             <button
                                key={cat}
                                onClick={() => setActiveSubCategory(cat)}
                                className={`flex-1 text-[8px] py-1 border-b-2 uppercase tracking-tight transition-colors ${
                                    activeSubCategory === cat 
                                    ? 'text-[#f3e2b5] border-[#ffd93d] font-bold' 
                                    : 'text-[#a88b6a] border-transparent hover:text-[#d4b078]'
                                }`}
                             >
                                {cat}
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
                               <span className="absolute bottom-0 w-full text-center text-[8px] bg-black/50 text-white truncate px-0.5">{obj.name}</span>
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
                      label="GRID" 
                      checked={showCollision} 
                      onChange={setShowCollision}
                    />
                 </label>

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
                   {activeMode === 'objects' ? (
                      quickbarObjectSlots.map((objectId, index) => {
                         if (!objectId) {
                            return (
                                <div key={`qb-obj-empty-${index}`} className="relative w-12 h-12 border-2 border-[#c2a075] bg-[#d9bd92] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] rounded-sm flex items-center justify-center">
                                  <span className="text-[#a88b6a]/50 text-xl">+</span>
                                  <span className="absolute -top-2 -left-2 w-5 h-5 flex items-center justify-center bg-[#8b6b4a] text-[#f6e2b0] text-[10px] font-bold border border-[#5a4030] rounded-full z-10">{index + 1}</span>
                                </div>
                            );
                         }
                         const objDef = objectsById.get(objectId);
                         if (!objDef) return null;
                         const preview = getObjectPreviewData(objDef);
                         return (
                            <button
                                key={`qb-obj-${index}`}
                                onClick={() => selectObjectId(objectId)}
                                className={`relative w-12 h-12 border-2 rounded-sm active:scale-95 transition-all group ${
                                    activeObjectId === objectId
                                    ? 'border-[#ffd93d] bg-[#fdf6d8] shadow-[0_0_8px_#ffd93d] z-10'
                                    : 'border-[#8b6b4a] bg-[#f9eaca] hover:border-[#a88b6a]'
                                }`}
                            >
                                <span className={`absolute -top-2 -left-2 w-5 h-5 flex items-center justify-center text-[10px] font-bold border rounded-full z-20 ${
                                  activeObjectId === objectId ? 'bg-[#ffd93d] text-[#5a4030] border-[#e8b030]' : 'bg-[#8b6b4a] text-[#f6e2b0] border-[#5a4030]' 
                                }`}>{index + 1}</span>
                                <div 
                                    className="w-full h-full bg-no-repeat bg-center"
                                    style={{
                                        backgroundImage: `url(${preview.imageUrl})`,
                                        backgroundPosition: preview.backgroundPosition,
                                        backgroundSize: preview.backgroundSize,
                                        transform: 'scale(0.8)'
                                    }}
                                />
                            </button>
                         );
                      })
                   ) : (
                      quickbarTileSlots.map((tileId, index) => {
                        if (tileId === null || tileId === undefined) {
                            return (
                                <div key={`qb-tile-empty-${index}`} className="relative w-12 h-12 border-2 border-[#c2a075] bg-[#d9bd92] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] rounded-sm flex items-center justify-center">
                                  <span className="absolute -top-2 -left-2 w-5 h-5 flex items-center justify-center bg-[#8b6b4a] text-[#f6e2b0] text-[10px] font-bold border border-[#5a4030] rounded-full z-10">{index + 1}</span>
                                </div>
                            );
                        }
                        const pos = getTilePos(tileId);
                        return (
                            <button
                                key={`qb-tile-${index}`}
                                onClick={() => selectTileId(tileId)}
                                className={`relative w-12 h-12 border-2 rounded-sm active:scale-95 transition-all group ${
                                    selectedTileId === tileId
                                    ? 'border-[#ffd93d] bg-[#fdf6d8] shadow-[0_0_8px_#ffd93d] z-10'
                                    : 'border-[#8b6b4a] bg-[#f9eaca] hover:border-[#a88b6a]'
                                }`}
                            >
                                <span className={`absolute -top-2 -left-2 w-5 h-5 flex items-center justify-center text-[10px] font-bold border rounded-full z-20 ${
                                  selectedTileId === tileId ? 'bg-[#ffd93d] text-[#5a4030] border-[#e8b030]' : 'bg-[#8b6b4a] text-[#f6e2b0] border-[#5a4030]' 
                                }`}>{index + 1}</span>
                                <div
                                    className="w-full h-full rendering-pixelated"
                                    style={{
                                        backgroundImage: `url(${tilesetUrl})`,
                                        backgroundPosition: `-${pos.sx}px -${pos.sy}px`,
                                        backgroundSize: `${tilesetCols * tileSize}px ${tilesetRows * tileSize}px`,
                                    }}
                                />
                            </button>
                        );
                      })
                   )}
                </div>
             </StardewFrame>
        </div>
    );
  };

  const renderCanvas = () => {
      // Dimensions of the scaled content
      const contentWidth = mapPixelWidth * canvasScale;
      const contentHeight = mapPixelHeight * canvasScale;

      return (
        <div 
          ref={canvasContainerRef}
          className="w-full h-full overflow-auto custom-scrollbar bg-[#a89070] relative"
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
                        onPointerEnter={() => handlePointerEnter(rIndex, cIndex)}
                        onPointerMove={() => {
                          if (isPointerDown) handlePointerEnter(rIndex, cIndex);
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
             {showObjects && placedObjectsSorted.length > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  {placedObjectsSorted.map((placement) => {
                    const objectDef = objectsById.get(placement.objectId);
                    if (!objectDef) return null;
                    const bounds = getObjectPixelBounds(objectDef, placement);
                    const objectImageUrl = objectDef.imagePath ? resolveAssetPath(objectDef.imagePath) : tilesetUrl;

                    // For terrain/paths: force display to grid size (32px) regardless of source image size
                    const isGroundTile = (objectDef as any).category === 'terrain' || (objectDef as any).category === 'paths';
                    const objectPixelWidth = isGroundTile
                      ? tileSize
                      : (objectDef.pixelWidth ?? objectDef.tileWidth * tileSize) * ((objectDef as any).scale ?? 1.0);
                    const objectPixelHeight = isGroundTile
                      ? tileSize
                      : (objectDef.pixelHeight ?? objectDef.tileHeight * tileSize) * ((objectDef as any).scale ?? 1.0);

                    // For ground tiles, no offset needed since they align to grid
                    const objectOffsetY = isGroundTile
                      ? 0
                      : (objectDef.imagePath && objectDef.anchor === 'bottom-left'
                        ? Math.max(0, bounds.height - objectPixelHeight)
                        : 0);
                    return (
                      <div
                        key={placement.id}
                        className="absolute"
                        style={{
                          left: bounds.left,
                          top: bounds.top + objectOffsetY,
                          width: objectPixelWidth,
                          height: objectPixelHeight,
                          backgroundImage: `url(${objectImageUrl})`,
                          backgroundPosition: objectDef.imagePath
                            ? '0px 0px'
                            : `-${objectDef.tileX * tileSize}px -${objectDef.tileY * tileSize}px`,
                          backgroundSize: objectDef.imagePath
                            ? `${objectPixelWidth}px ${objectPixelHeight}px`
                            : `${tilesetCols * tileSize}px ${tilesetRows * tileSize}px`,
                          backgroundRepeat: 'no-repeat',
                          imageRendering: 'pixelated',
                        }}
                      />
                    );
                  })}
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
                      const collisionValue = collisionLayer[cIndex]?.[rIndex] ?? -1;
                      const overlayClass = collisionValue === COLLISION_WALKABLE ? 'bg-green-500/30' : collisionValue === COLLISION_BLOCKED ? 'bg-red-500/30' : collisionValue !== -1 ? 'bg-yellow-500/30' : '';
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
                const isGroundTile = (activeObject as any).category === 'terrain' || (activeObject as any).category === 'paths';
                const previewWidth = isGroundTile ? tileSize : objectPreviewBounds.width;
                const previewHeight = isGroundTile ? tileSize : objectPreviewBounds.height;
                const bgWidth = isGroundTile ? tileSize : (activeObject.pixelWidth ?? activeObject.tileWidth * tileSize);
                const bgHeight = isGroundTile ? tileSize : (activeObject.pixelHeight ?? activeObject.tileHeight * tileSize);
                const bgOffsetY = isGroundTile ? 0 : (activeObject.anchor === 'bottom-left' ? Math.max(0, objectPreviewBounds.height - bgHeight) : 0);

                return (
                  <div className="absolute pointer-events-none" style={{ left: objectPreviewBounds.left, top: objectPreviewBounds.top, width: previewWidth, height: previewHeight, opacity: objectPreviewValid ? 0.7 : 0.4 }}>
                     <div className="absolute inset-0" style={{
                       backgroundImage: `url(${activeObject.imagePath ? resolveAssetPath(activeObject.imagePath) : tilesetUrl})`,
                       backgroundPosition: activeObject.imagePath ? `0px ${bgOffsetY}px` : `-${activeObject.tileX * tileSize}px -${activeObject.tileY * tileSize}px`,
                       backgroundSize: activeObject.imagePath ? `${bgWidth}px ${bgHeight}px` : `${tilesetCols * tileSize}px ${tilesetRows * tileSize}px`,
                       backgroundRepeat: 'no-repeat'
                     }} />
                     <div className={`absolute inset-0 border-2 ${objectPreviewValid ? 'border-emerald-300/70' : 'border-red-400/70'}`} />
                  </div>
                );
             })()}

             {/* Selection Bounds */}
             {selectionBounds && (
                <div className="absolute pointer-events-none border-2 border-cyan-400/80 bg-cyan-400/10" style={{ left: selectionBounds.minCol * tileSize, top: selectionBounds.minRow * tileSize, width: (selectionBounds.maxCol - selectionBounds.minCol + 1) * tileSize, height: (selectionBounds.maxRow - selectionBounds.minRow + 1) * tileSize }} />
             )}
          </div>
          </div>
          
           {/* Hover Info Overlay - Floating in Canvas Area */}
           <div className="fixed bottom-4 right-4 bg-black/80 text-[#f6e2b0] px-3 py-1.5 rounded-md pointer-events-none z-50 text-[10px] border border-[#5a4030] shadow shadow-black/50 font-mono">
              {hoverInfo
                ? `X ${hoverInfo.col} Y ${hoverInfo.row} | ${activeToolLabel}`
                : `Hover to inspect | ${activeToolLabel}`}
           </div>

           {/* Zoom Controls - Floating in Canvas Corner */}
           <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-[#3b2a21]/95 px-3 py-2 rounded-lg border-2 border-[#6d4c30] shadow-lg z-40">
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
           </div>
        </div>
    );
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#fdf6d8] flex items-center justify-center font-display">
      <div 
        className="relative select-none p-4 transition-all duration-300 origin-center"
        style={{
          transform: 'scale(1.3)', // Scale up entire UI by 30% for thicker borders
          display: 'grid',
          // Flexible columns: Sidebars take content width, Main takes remaining
          gridTemplateColumns: 'min-content 1fr min-content', 
          gridTemplateRows: 'auto 1fr auto', // Header takes content, Main fills, Footer takes content
          gridTemplateAreas: `
            ". header header"
            "sidebar-left main sidebar-right"
            "sidebar-left footer sidebar-right"
          `,
          gap: '10px', // Slightly reduced gap for scaled view
          imageRendering: 'pixelated',
          width: '77%', // 100% / 1.3 to fit within viewport after scaling
          height: '77%',
        }}
      >
        {/* --------------------------------------------------------------------------
            Zone: Sidebar Left (Tiles)
            Area: sidebar-left
            Responsive Width: min-content (based on children)
           -------------------------------------------------------------------------- */}
         {/* Hanging Sign - Positioned absolutely relative to the scaled grid container, at the top left column */}
         <div className="absolute top-0 left-[140px] z-30 pointer-events-none" style={{ transform: 'translateX(-50%) translateY(-25%)' }}>
             <HangingSign scale={0.9} />
         </div>

        {/* --------------------------------------------------------------------------
            Zone: Sidebar Left (Tiles)
            Area: sidebar-left
            Responsive Width: min-content (based on children)
           -------------------------------------------------------------------------- */}
        <div style={{ gridArea: 'sidebar-left', transform: 'translateY(-5%)' }} className="relative h-full pt-4 min-w-[260px] min-h-[450px]">
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
                         {/* Sub-Category Pills (icon-only, cleaner design) */}
                         {activeSubCategory !== 'buildings' && (
                             <div className="flex items-center justify-center gap-2 mb-3">
                                {[
                                   { id: 'nature', icon: '🌳', label: 'Nature' },
                                   { id: 'furniture', icon: '🪑', label: 'Furniture' },
                                   { id: 'decorations', icon: '✨', label: 'Decorations' }
                                ].map(cat => (
                                   <button
                                      key={cat.id}
                                      onClick={() => setActiveSubCategory(cat.id)}
                                      title={cat.label}
                                      className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all ${
                                          activeSubCategory === cat.id 
                                          ? 'bg-[#ffd93d] border-2 border-[#e8b030] shadow-lg scale-110' 
                                          : 'bg-[#5a4030] border-2 border-[#6d4c30] hover:bg-[#6d4c30] hover:scale-105'
                                      }`}
                                   >
                                      {cat.icon}
                                   </button>
                                ))}
                             </div>
                         )}

                         {/* Objects Grid - use filteredObjects which filters by activeSubCategory */}
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
                                     <span className="absolute bottom-0 w-full text-center text-[8px] bg-black/50 text-white truncate px-0.5">{obj.name}</span>
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
         <div style={{ gridArea: 'header' }} className="flex h-[108px] gap-[10px] justify-end pr-[15%]"> {/* pr-15% shifts it left */}
             {/* Header Left: Tabs (Fit to content) */}
             <div className="h-full w-fit"> 
                 <StardewFrame className="flex items-center px-4 h-full" >
                     <div className="flex items-center gap-2">
                         {[
                           { label: 'TERRAIN', mode: 'objects' as EditorMode, category: null, subCategory: 'terrain' },
                           { label: 'PATHS', mode: 'objects' as EditorMode, category: null, subCategory: 'paths' },
                           { label: 'PROPS', mode: 'objects' as EditorMode, category: null, subCategory: 'nature' },
                           { label: 'BUILDINGS', mode: 'objects' as EditorMode, category: null, subCategory: 'buildings' }
                         ].map((tab) => (
                            <div key={tab.label} className="relative">
                                <StardewTab
                                  label={tab.label}
                                  isActive={
                                    tab.subCategory 
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
        <div style={{ gridArea: 'main' }} className="relative flex items-center justify-center min-h-0 min-w-0"> {/* min-h/w-0 prevents grid blowout */}
            <div className="border-[6px] border-[#6d4c30] bg-[#d4c4a0] shadow-[inset_0_0_20px_rgba(0,0,0,0.2)] rounded overflow-hidden flex ring-4 ring-[#8b6b4a]" style={{ width: '90%', height: '90%', maxWidth: '800px', maxHeight: '600px' }}>
                {renderCanvas()}
            </div>
        </div>

        {/* --------------------------------------------------------------------------
            Zone: Footer (Quickbar)
            Area: footer
            Responsive Height: auto
           -------------------------------------------------------------------------- */}
        <div style={{ gridArea: 'footer', transform: 'translateY(-15%)' }} className="flex justify-center items-center h-[100px]">
             <div className="h-full">
                <StardewFrame className="h-full flex items-center justify-center px-4" >
                     <div className="flex gap-2 items-center">
                        {/* Render Quickbar Slots */}
                        {Array.from({ length: 8 }).map((_, index) => {
                           let content = null;
                        const objectId = activeMode === 'objects' ? quickbarObjectSlots[index] : null;
                        const tileId = activeMode !== 'objects' ? quickbarTileSlots[index] : null;
                        const isActive = activeMode === 'objects' ? activeObjectId === objectId : selectedTileId === tileId && tileId !== null;

                           if (activeMode === 'objects' && objectId) {
                                   const objDef = objectsById.get(objectId);
                                   if (objDef) {
                                       const preview = getObjectPreviewData(objDef);
                                       content = (
                                           <div 
                                                className="bg-no-repeat bg-center"
                                                style={{
                                                    width: `${objDef.pixelWidth ?? objDef.tileWidth * tileSize}px`,
                                                    height: `${objDef.pixelHeight ?? objDef.tileHeight * tileSize}px`,
                                                    backgroundImage: `url(${preview.imageUrl})`,
                                                    backgroundPosition: preview.backgroundPosition,
                                                    backgroundSize: preview.backgroundSize,
                                                    transform: 'scale(0.8)',
                                                    imageRendering: 'pixelated'
                                                }}
                                            />
                                       );
                                   }
                           } else if (activeMode !== 'objects' && tileId !== null && tileId !== undefined) {
                                   const pos = getTilePos(tileId);
                                   content = (
                                        <div
                                            className="rendering-pixelated"
                                            style={{
                                                width: `${tileSize}px`,
                                                height: `${tileSize}px`,
                                                backgroundImage: `url(${tilesetUrl})`,
                                                backgroundPosition: `-${pos.sx}px -${pos.sy}px`,
                                                backgroundSize: `${tilesetCols * tileSize}px ${tilesetRows * tileSize}px`,
                                            }}
                                        />
                                   );
                           }

                           return (
                              <button
                                  key={`qb-${index}`}
                                  onClick={() => {
                                    if(activeMode === 'objects' && objectId) selectObjectId(objectId);
                                    if(activeMode !== 'objects' && tileId !== null) selectTileId(tileId);
                                  }}
                                  className={`relative w-10 h-10 flex items-center justify-center transition-all duration-75 rounded-sm overflow-hidden group ${
                                      isActive
                                      ? 'bg-[#e8d4b0] border-2 border-[#6d4c30] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] scale-105 z-10' // Active: Inset
                                      : 'bg-[#e8d4b0] border-2 border-[#8b6b4a] shadow-[inset_0_-2px_0_rgba(0,0,0,0.2),0_2px_0_rgba(0,0,0,0.2)] hover:bg-[#ffe6b5] hover:-translate-y-0.5' // Inactive: Raised (Matches Header Tools)
                                  }`}
                              >
                                  <span className={`absolute -top-1 -left-1 w-3 h-3 flex items-center justify-center text-[7px] font-bold border rounded-full z-20 ${
                                    isActive ? 'bg-[#ffd93d] text-[#5a4030] border-[#e8b030]' : 'bg-[#8b6b4a] text-[#f6e2b0] border-[#5a4030]' 
                                  }`}>{index + 1}</span>
                                  
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
        <div style={{ gridArea: 'sidebar-right', alignSelf: 'start' }} className="flex flex-col pt-4 pl-2 w-[160px]">
            <StardewFrame className="p-3 w-full">
                <div className="flex flex-col gap-1">
                   {/* Export Button */}
                    <button 
                        onClick={exportMap}
                        className="bg-[#4a8f4a] border-2 border-[#2e5e2e] text-[#f3e2b5] px-2 py-1.5 rounded text-[9px] hover:bg-[#5aa85a] active:scale-95 shadow-sm font-display uppercase tracking-wider w-full flex items-center justify-center gap-1"
                    >
                        💾 <span>EXPORT</span>
                    </button>
                    <button 
                        onClick={() => setShowAssetSlicer(true)}
                        className="bg-[#8b4513] border-2 border-[#5d2f0d] text-[#f3e2b5] px-2 py-1.5 rounded text-[9px] hover:bg-[#a0522d] active:scale-95 shadow-sm font-display uppercase tracking-wider w-full flex items-center justify-center gap-1"
                    >
                        ✂️ <span>SLICE</span>
                    </button>
                    
                    <div className="h-px bg-[#6d4c30] w-full my-1.5 opacity-30" />

                   <label className="flex items-center gap-1 cursor-pointer hover:brightness-110 transition-all" title="Show/Hide grid overlay">
                      <StardewCheckbox 
                        label="GRID" 
                        checked={showCollision} 
                        onChange={setShowCollision}
                        className="scale-70 origin-left"
                      />
                   </label>

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
                   
                   <div className="h-px bg-[#6d4c30] w-full my-1.5 opacity-30" />
                   
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
