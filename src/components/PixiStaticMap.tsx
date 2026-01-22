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
const TILESET_BASE_URL = import.meta.env.BASE_URL ?? '/';
const TILESET_BASE_PATH = TILESET_BASE_URL.endsWith('/') ? TILESET_BASE_URL : `${TILESET_BASE_URL}/`;

const resolveAssetPath = (path: string) => {
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `${TILESET_BASE_PATH}${encodeURI(path)}`;
};

let cachedAssetsManifest: AssetsManifest | null = null;
let assetsManifestPromise: Promise<AssetsManifest | null> | null = null;

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

const normalizeRotation = (rotation: number | undefined) => {
  const normalized = ((rotation ?? 0) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
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
    const placedObjectsContainer = new PIXI.Container();
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

    container.addChild(placedObjectsContainer);
    container.addChild(animatedContainer);

    const placedObjects = map.placedObjects ?? [];
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
          placedObjectsContainer.addChild(holder);
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
