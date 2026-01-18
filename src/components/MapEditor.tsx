import { useState, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatedSprite as PixiAnimatedSprite, Container, Stage } from '@pixi/react';
import { BaseTexture, SCALE_MODES, Spritesheet, type ISpritesheetData } from 'pixi.js';
// Import map data directly
import {
  bgtiles,
  objmap,
  animatedsprites,
  tilesetpath,
  tiledim,
  tilesetpxw,
  tilesetpxh,
  mapwidth,
  mapheight,
} from '../../data/gentle.js';
import * as campfire from '../../data/animations/campfire.json';
import * as gentlesparkle from '../../data/animations/gentlesparkle.json';
import * as gentlewaterfall from '../../data/animations/gentlewaterfall.json';
import * as gentlesplash from '../../data/animations/gentlesplash.json';
import * as windmill from '../../data/animations/windmill.json';

const TILE_SIZE = tiledim; // 32
const TILESET_COLS = Math.floor(tilesetpxw / TILE_SIZE); // 45
const TILESET_ROWS = Math.floor(tilesetpxh / TILE_SIZE); // 32

// Map dimensions from the actual data
const MAP_WIDTH = mapwidth ?? bgtiles[0]?.length ?? 48;
const MAP_HEIGHT = mapheight ?? bgtiles[0]?.[0]?.length ?? 65;

// Collision layer tile meanings
const COLLISION_WALKABLE = 367;
const COLLISION_BLOCKED = 458;
const RECENT_TILES_MAX = 12;

type MapAnimatedSprite = {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
  sheet: string;
  animation: string;
};

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

const MAP_PIXEL_WIDTH = MAP_WIDTH * TILE_SIZE;
const MAP_PIXEL_HEIGHT = MAP_HEIGHT * TILE_SIZE;
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
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [showCollision, setShowCollision] = useState(true); // Toggle collision overlay
  const [showAnimatedSprites, setShowAnimatedSprites] = useState(true);
  const [tilesetLoaded, setTilesetLoaded] = useState(false);
  const [activeTool, setActiveTool] = useState<'brush' | 'eraser' | 'eyedropper'>('brush');
  const [paletteMode, setPaletteMode] = useState<'used' | 'all'>('used');
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [recentTiles, setRecentTiles] = useState<number[]>([]);
  const [hoverInfo, setHoverInfo] = useState<{
    row: number;
    col: number;
    tileId: number;
    collisionValue: number;
  } | null>(null);
  const tilesetRef = useRef<HTMLImageElement | null>(null);
  const dragToolRef = useRef<'brush' | 'eraser' | 'eyedropper' | null>(null);

  // Combine all BG layers for rendering (layer 0 is base, layer 1+ are overlays)
  // bgtiles structure: bgtiles[layerIndex][x][y] = tileIndex
  const [bgLayers, setBgLayers] = useState<number[][][]>(() => {
    return bgtiles.map((layer: number[][]) =>
      layer.slice(0, MAP_WIDTH).map((column: number[]) => [...column.slice(0, MAP_HEIGHT)])
    );
  });

  // objmap is collision data, not visual tiles
  // objmap[0] contains walkability info: 367 = walkable, 458 = blocked, -1 = default
  const [collisionLayer, setCollisionLayer] = useState<number[][]>(() => {
    const layer0 = objmap[0];
    if (!layer0) {
      return Array.from({ length: MAP_WIDTH }, () => Array(MAP_HEIGHT).fill(-1));
    }
    return layer0.slice(0, MAP_WIDTH).map((column: number[]) => [...column.slice(0, MAP_HEIGHT)]);
  });

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

  // Preload tileset image
  useEffect(() => {
    const img = new Image();
    img.src = tilesetpath;
    img.onload = () => {
      tilesetRef.current = img;
      setTilesetLoaded(true);
    };
    img.onerror = () => {
      console.error('Failed to load tileset image:', tilesetpath);
    };
  }, []);

  // Get the x, y position in the tileset for a given tile ID
  const getTilePos = (tileId: number): { sx: number; sy: number } => {
    if (tileId < 0) return { sx: -1, sy: -1 };
    const row = Math.floor(tileId / TILESET_COLS);
    const col = tileId % TILESET_COLS;
    return { sx: col * TILE_SIZE, sy: row * TILE_SIZE };
  };

  const pushRecentTile = (tileId: number) => {
    if (tileId < 0) return;
    setRecentTiles((prev) => {
      const filtered = prev.filter((id) => id !== tileId);
      return [tileId, ...filtered].slice(0, RECENT_TILES_MAX);
    });
  };

  const selectTileId = (tileId: number) => {
    setSelectedTileId(tileId);
    if (tileId >= 0) {
      pushRecentTile(tileId);
      setActiveTool('brush');
    } else {
      setActiveTool('eraser');
    }
  };

  const paletteTileIds =
    paletteMode === 'used'
      ? usedTileStats.usedIds
      : Array.from({ length: TILESET_ROWS * TILESET_COLS }, (_, index) => index);

  const getTopTileId = (row: number, col: number) => {
    for (let i = bgLayers.length - 1; i >= 0; i -= 1) {
      const tileId = bgLayers[i]?.[col]?.[row] ?? -1;
      if (tileId >= 0) return tileId;
    }
    return -1;
  };

  const applyToolAt = (row: number, col: number, tool: 'brush' | 'eraser' | 'eyedropper') => {
    if (tool === 'eyedropper') {
      const tileId = getTopTileId(row, col);
      selectTileId(tileId);
      return;
    }
    const tileIdToPlace = tool === 'eraser' ? -1 : selectedTileId;
    if (tileIdToPlace === null) return;
    setBgLayers((prev) => {
      const layer0 = prev[0];
      if (!layer0?.[col]) return prev;
      if (layer0[col][row] === tileIdToPlace) return prev;
      const next = prev.map((layer, layerIndex) => {
        if (layerIndex !== 0) return layer;
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
    setHoverInfo({
      row,
      col,
      tileId: getTopTileId(row, col),
      collisionValue: collisionLayer[col]?.[row] ?? -1,
    });
    const tool = event.button === 2 ? 'eraser' : activeTool;
    dragToolRef.current = tool;
    setIsPointerDown(true);
    applyToolAt(row, col, tool);
    if (tool === 'eyedropper') {
      dragToolRef.current = null;
      setIsPointerDown(false);
    }
  };

  const handlePointerEnter = (row: number, col: number) => {
    const tileId = getTopTileId(row, col);
    const collisionValue = collisionLayer[col]?.[row] ?? -1;
    setHoverInfo({ row, col, tileId, collisionValue });
    if (isPointerDown && dragToolRef.current) {
      applyToolAt(row, col, dragToolRef.current);
    }
  };

  useEffect(() => {
    const handlePointerUp = () => {
      setIsPointerDown(false);
      dragToolRef.current = null;
    };
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const key = event.key.toLowerCase();
      if (key === 'b') setActiveTool('brush');
      if (key === 'e') setActiveTool('eraser');
      if (key === 'i') setActiveTool('eyedropper');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Export map data
  const exportMap = () => {
    const mapData = {
      bgtiles: bgLayers,
      objmap: [collisionLayer], // Keep same structure
    };
    console.log("===== EXPORTED MAP DATA =====");
    console.log(JSON.stringify(mapData, null, 2));
    const blob = new Blob([JSON.stringify(mapData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'map_export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert("Map exported! Check your downloads folder.");
  };

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex overflow-hidden">
      {/* Sidebar: Tile Palette */}
      <div className="w-72 bg-gray-800 p-3 border-r border-gray-700 flex flex-col shrink-0">
        <h2 className="text-lg font-bold mb-2 text-center">🎨 Tile Palette</h2>

        {/* Display Options */}
        <div className="mb-3 space-y-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showCollision}
              onChange={(e) => setShowCollision(e.target.checked)}
              className="rounded"
            />
            Show Collision Overlay
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showAnimatedSprites}
              onChange={(e) => setShowAnimatedSprites(e.target.checked)}
              className="rounded"
            />
            Show Animated Sprites (Pixi)
          </label>
        </div>

        {/* Collision Legend */}
        <div className="mb-3 p-2 bg-gray-700 rounded text-xs">
          <p className="font-bold mb-1">Collision Legend:</p>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500/50 border border-green-400"></div>
            <span>Walkable ({COLLISION_WALKABLE})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500/50 border border-red-400"></div>
            <span>Blocked ({COLLISION_BLOCKED})</span>
          </div>
        </div>

        {/* Selected Tile Preview */}
        <div className="mb-3 p-2 bg-gray-700 rounded text-center">
          <p className="text-xs text-gray-400 mb-1">Selected: {selectedTileId ?? 'None'}</p>
          {selectedTileId !== null && selectedTileId >= 0 && tilesetLoaded && (
            <div
              className="mx-auto border-2 border-yellow-400"
              style={{
                width: TILE_SIZE * 2,
                height: TILE_SIZE * 2,
                backgroundImage: `url(${tilesetpath})`,
                backgroundPosition: `-${getTilePos(selectedTileId).sx * 2}px -${getTilePos(selectedTileId).sy * 2}px`,
                backgroundSize: `${TILESET_COLS * TILE_SIZE * 2}px ${TILESET_ROWS * TILE_SIZE * 2}px`,
              }}
            />
          )}
        </div>

        {recentTiles.length > 0 && tilesetLoaded && (
          <div className="mb-3 p-2 bg-gray-700 rounded">
            <p className="text-xs text-gray-400 mb-1">Recent Tiles</p>
            <div className="grid grid-cols-4 gap-1">
              {recentTiles.map((tileId) => {
                const pos = getTilePos(tileId);
                return (
                  <button
                    key={`recent-${tileId}`}
                    className={`border-2 ${
                      selectedTileId === tileId ? 'border-yellow-400' : 'border-transparent hover:border-gray-500'
                    }`}
                    style={{
                      width: TILE_SIZE,
                      height: TILE_SIZE,
                      backgroundImage: `url(${tilesetpath})`,
                      backgroundPosition: `-${pos.sx}px -${pos.sy}px`,
                      backgroundSize: `${TILESET_COLS * TILE_SIZE}px ${TILESET_ROWS * TILE_SIZE}px`,
                    }}
                    onClick={() => selectTileId(tileId)}
                    title={`Tile #${tileId}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Tileset Scrollable Area */}
        <div
          className="flex-grow overflow-y-auto overflow-x-hidden border border-gray-600 rounded p-1"
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-300">
            <button
              onClick={() => setPaletteMode('used')}
              className={`px-2 py-1 border ${
                paletteMode === 'used'
                  ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-500'
              }`}
            >
              Used ({usedTileStats.usedIds.length})
            </button>
            <button
              onClick={() => setPaletteMode('all')}
              className={`px-2 py-1 border ${
                paletteMode === 'all'
                  ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-500'
              }`}
            >
              All ({TILESET_ROWS * TILESET_COLS})
            </button>
          </div>
          {!tilesetLoaded ? (
            <p className="text-center text-gray-500">Loading tileset...</p>
          ) : paletteMode === 'used' && usedTileStats.usedIds.length === 0 ? (
            <div className="text-xs text-gray-400">
              No used tiles yet. Switch to <span className="text-gray-200">All</span> to pick a tile.
            </div>
          ) : (
            <div
              className="grid gap-[1px]"
              style={{ gridTemplateColumns: `repeat(8, ${TILE_SIZE}px)` }}
            >
              {/* Eraser tile */}
              <div
                onClick={() => selectTileId(-1)}
                className={`cursor-pointer border-2 flex items-center justify-center text-xs text-red-400 ${
                  selectedTileId === -1 ? 'border-yellow-400' : 'border-gray-600'
                }`}
                style={{ width: TILE_SIZE, height: TILE_SIZE, backgroundColor: '#333' }}
                title="Eraser (-1)"
              >
                X
              </div>
              {/* Generate all tiles from the tileset */}
              {paletteTileIds.map((tileId) => {
                const { sx, sy } = getTilePos(tileId);
                const usedCount = usedTileStats.counts.get(tileId) ?? 0;
                return (
                  <div
                    key={tileId}
                    onClick={() => selectTileId(tileId)}
                    className={`cursor-pointer border-2 ${
                      selectedTileId === tileId ? 'border-yellow-400' : 'border-transparent hover:border-gray-500'
                    }`}
                    style={{
                      width: TILE_SIZE,
                      height: TILE_SIZE,
                      backgroundImage: `url(${tilesetpath})`,
                      backgroundPosition: `-${sx}px -${sy}px`,
                      backgroundSize: `${TILESET_COLS * TILE_SIZE}px ${TILESET_ROWS * TILE_SIZE}px`,
                    }}
                    title={
                      paletteMode === 'used'
                        ? `Tile #${tileId} · Used ${usedCount}`
                        : `Tile #${tileId}`
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={exportMap}
          className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-bold"
        >
          📥 Export Map JSON
        </button>
      </div>

      {/* Main Area: Map Editor Canvas */}
      <div className="flex-grow overflow-auto p-2 bg-gray-950">
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-300">
          <button
            onClick={() => setActiveTool('brush')}
            className={`px-2 py-1 border ${
              activeTool === 'brush'
                ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            }`}
          >
            Brush (B)
          </button>
          <button
            onClick={() => setActiveTool('eraser')}
            className={`px-2 py-1 border ${
              activeTool === 'eraser'
                ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            }`}
          >
            Eraser (E)
          </button>
          <button
            onClick={() => setActiveTool('eyedropper')}
            className={`px-2 py-1 border ${
              activeTool === 'eyedropper'
                ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            }`}
          >
            Eyedropper (I)
          </button>
          <div className="ml-auto text-gray-500">
            Map: {MAP_WIDTH}x{MAP_HEIGHT} tiles | Layers: {bgLayers.length} BG + 1 Collision
          </div>
        </div>
        <div className="mb-2 text-xs text-gray-500">
          {hoverInfo
            ? `X ${hoverInfo.col}  Y ${hoverInfo.row}  |  Tile ${hoverInfo.tileId}  |  Collision ${hoverInfo.collisionValue}`
            : 'Hover a tile to inspect | Right click to erase'}
        </div>
        <div
          className="relative inline-block"
          style={{ width: MAP_PIXEL_WIDTH, height: MAP_PIXEL_HEIGHT }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerLeave={() => setHoverInfo(null)}
        >
          <div
            className="absolute inset-0 bg-black border border-gray-700 shadow-xl"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${MAP_WIDTH}, ${TILE_SIZE}px)`,
            }}
          >
            {/* Render each cell */}
            {Array.from({ length: MAP_HEIGHT }).map((_, rIndex) =>
              Array.from({ length: MAP_WIDTH }).map((_, cIndex) => {
                return (
                  <div
                    key={`${rIndex}-${cIndex}`}
                    onPointerDown={(event) => handlePointerDown(event, rIndex, cIndex)}
                    onPointerEnter={() => handlePointerEnter(rIndex, cIndex)}
                    className="border-gray-800/20 border hover:border-white cursor-crosshair relative"
                    style={{
                      width: TILE_SIZE,
                      height: TILE_SIZE,
                    }}
                  >
                    {/* Render all BG layers in order */}
                    {bgLayers.map((layer, layerIndex) => {
                      const tileId = layer[cIndex]?.[rIndex] ?? -1;
                      if (tileId < 0 || !tilesetLoaded) return null;
                      const pos = getTilePos(tileId);
                      return (
                        <div
                          key={`layer-${layerIndex}`}
                          className="absolute inset-0"
                          style={{
                            backgroundImage: `url(${tilesetpath})`,
                            backgroundPosition: `-${pos.sx}px -${pos.sy}px`,
                            backgroundSize: `${TILESET_COLS * TILE_SIZE}px ${TILESET_ROWS * TILE_SIZE}px`,
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {showAnimatedSprites && (
            <div className="absolute inset-0 pointer-events-none">
              <Stage
                width={MAP_PIXEL_WIDTH}
                height={MAP_PIXEL_HEIGHT}
                options={{ backgroundAlpha: 0, antialias: false }}
              >
                <PixiAnimatedSpritesLayer sprites={animatedsprites as MapAnimatedSprite[]} />
              </Stage>
            </div>
          )}

          {showCollision && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${MAP_WIDTH}, ${TILE_SIZE}px)`,
              }}
            >
              {Array.from({ length: MAP_HEIGHT }).map((_, rIndex) =>
                Array.from({ length: MAP_WIDTH }).map((_, cIndex) => {
                  const collisionValue = collisionLayer[cIndex]?.[rIndex] ?? -1;
                  const overlayClass =
                    collisionValue === COLLISION_WALKABLE
                      ? 'bg-green-500/30'
                      : collisionValue === COLLISION_BLOCKED
                      ? 'bg-red-500/30'
                      : collisionValue !== -1
                      ? 'bg-yellow-500/30'
                      : '';
                  return (
                    <div
                      key={`collision-${rIndex}-${cIndex}`}
                      className={overlayClass}
                      style={{ width: TILE_SIZE, height: TILE_SIZE }}
                    />
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapEditor;
