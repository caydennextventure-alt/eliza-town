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

// Cache for parsed spritesheets to avoid duplicate texture cache entries
const animationSpritesheetCache = new Map<string, PIXI.Spritesheet>();

// Helper to create spritesheet data with unique frame names
function createUniqueSpritesheetData(
  originalData: PIXI.ISpritesheetData,
  prefix: string
): PIXI.ISpritesheetData {
  return {
    ...originalData,
    frames: Object.fromEntries(
      Object.entries(originalData.frames).map(([key, value]) => [
        `${prefix}_${key}`,
        value,
      ])
    ),
    animations: originalData.animations
      ? Object.fromEntries(
          Object.entries(originalData.animations).map(([key, frames]) => [
            key,
            frames.map((frame: string) => `${prefix}_${frame}`),
          ])
        )
      : undefined,
  };
}

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
      const animation = (animations as Record<string, { spritesheet: PIXI.ISpritesheetData; url: string }>)[sheet];
      if (!animation) {
        console.error('Could not find animation', sheet);
        continue;
      }
      const { spritesheet, url } = animation;

      // Check if we already have this spritesheet cached
      const cacheKey = `${url}_${sheet}`;
      const cachedSheet = animationSpritesheetCache.get(cacheKey);

      if (cachedSheet) {
        // Use cached spritesheet
        for (const sprite of sprites) {
          const pixiAnimation = cachedSheet.animations[sprite.animation];
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
          container.addChild(pixiSprite);
          pixiSprite.play();
        }
      } else {
        // Create new spritesheet with unique frame names
        const texture = PIXI.BaseTexture.from(url, {
          scaleMode: PIXI.SCALE_MODES.NEAREST,
        });
        const uniqueSpritesheetData = createUniqueSpritesheetData(spritesheet, cacheKey);
        const spriteSheet = new PIXI.Spritesheet(texture, uniqueSpritesheetData);
        spriteSheet.parse().then(() => {
          animationSpritesheetCache.set(cacheKey, spriteSheet);
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
            container.addChild(pixiSprite);
            pixiSprite.play();
          }
        });
      }
    }

    container.x = 0;
    container.y = 0;

    // Set the hit area manually to ensure `pointerdown` events are delivered to this container.
    container.eventMode = 'static';
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
