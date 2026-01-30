import { PixiComponent, useApp } from '@pixi/react';
import { Application } from 'pixi.js';
import * as PIXI from 'pixi.js';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
const BASE_PATH = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;

const resolveAssetPath = (path: string) => {
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `${BASE_PATH}${encodeURI(path)}`;
};

const BIRD_SHEET_URLS = [
  'assets/Tileset Asset/animated/birds/bird_1_bluejay.png',
  'assets/Tileset Asset/animated/birds/bird_1_brown.png',
  'assets/Tileset Asset/animated/birds/bird_1_white_crest.png',
  'assets/Tileset Asset/animated/birds/bird_2_brown_1.png',
  'assets/Tileset Asset/animated/birds/bird_2_eagle.png',
  'assets/Tileset Asset/animated/birds/bird_3_robin.png',
] as const;

// The provided bird sheets appear to face LEFT by default (when moving right, we need to flip).
const DEFAULT_SHEET_FACES_LEFT = true;

const FRAME_W = 32;
const FRAME_H = 32;
const COLS = 3;
const ROWS = 8;

const FLY_ROW = 0;
const WALK_ROW = 4;

const COUNT_DEFAULT = 4;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

type BirdState = 'fly' | 'walk' | 'idle';

type BirdFrameset = {
  fly: PIXI.Texture[];
  walk: PIXI.Texture[];
  idle: PIXI.Texture;
};

type BirdTuning = {
  flySpeed: [number, number];
  flyAnimSpeed: [number, number];
  walkSpeed: [number, number];
  walkAnimSpeed: [number, number];
  landChance: number;
};

type BirdSprite = PIXI.AnimatedSprite & {
  _state: BirdState;
  _frameset: BirdFrameset;
  _tuning: BirdTuning;
  _vx: number;
  _vy: number;
  _baseY: number;
  _amp: number;
  _freq: number;
  _phase: number;
  _scale: number;
  _landX: number;
  _groundY: number;
  _walkFor: number;
  _idleFor: number;
  _willLand: boolean;
  _respawnIn: number;
};

type BirdFxContainer = PIXI.Container & {
  __birdFxApp?: Application;
  __birdFxTick?: (delta: number) => void;
};

type BirdFxProps = {
  app: Application;
  count?: number;
};

const BirdFxLayer = PixiComponent('BirdFxLayer', {
  create: (props: BirdFxProps) => {
    const { app, count = COUNT_DEFAULT } = props;

    const container = new PIXI.Container() as BirdFxContainer;
    container.__birdFxApp = app;
    // Ensure birds never intercept clicks/dragging on the world.
    (container as any).eventMode = 'none';
    container.interactive = false;
    container.interactiveChildren = false;

    const framesByUrl = new Map<string, BirdFrameset>();
    const framesetPromises = new Map<string, Promise<BirdFrameset | null>>();
    const failedSheets = new Set<string>();

    const createFramesetFromBaseTexture = (baseTexture: PIXI.BaseTexture): BirdFrameset | null => {
      const cols = Math.floor(baseTexture.width / FRAME_W);
      const rows = Math.floor(baseTexture.height / FRAME_H);
      if (cols <= 0 || rows <= 0) return null;

      const makeRow = (row: number) => {
        const textures: PIXI.Texture[] = [];
        const safeRow = Math.max(0, Math.min(rows - 1, row));
        const usableCols = Math.max(1, Math.min(COLS, cols));
        for (let col = 0; col < usableCols; col += 1) {
          textures.push(
            new PIXI.Texture(
              baseTexture,
              new PIXI.Rectangle(col * FRAME_W, safeRow * FRAME_H, FRAME_W, FRAME_H),
            ),
          );
        }
        return textures;
      };

      const fly = makeRow(FLY_ROW);
      const walk = makeRow(WALK_ROW);
      const idle = walk[0] ?? fly[0] ?? PIXI.Texture.EMPTY;
      return { fly, walk, idle };
    };

    const loadFrameset = (url: string): Promise<BirdFrameset | null> => {
      const cached = framesByUrl.get(url);
      if (cached) return Promise.resolve(cached);
      const existing = framesetPromises.get(url);
      if (existing) return existing;

      const baseTexture = PIXI.BaseTexture.from(resolveAssetPath(url), {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      });

      const promise = new Promise<BirdFrameset | null>((resolve) => {
        const finalize = (frameset: BirdFrameset | null) => {
          baseTexture.off('loaded', onLoaded);
          baseTexture.off('error', onError);
          if (!frameset) {
            failedSheets.add(url);
          } else {
            framesByUrl.set(url, frameset);
          }
          resolve(frameset);
        };

        const onLoaded = () => {
          if (!baseTexture.valid) {
            finalize(null);
            return;
          }
          finalize(createFramesetFromBaseTexture(baseTexture));
        };

        const onError = () => finalize(null);

        if (baseTexture.valid) {
          onLoaded();
          return;
        }

        baseTexture.once('loaded', onLoaded);
        baseTexture.once('error', onError);
      });

      framesetPromises.set(url, promise);
      return promise;
    };

    const getFramesetSync = (url: string) => framesByUrl.get(url) ?? null;

    const getTuning = (url: string): BirdTuning => {
      const name = url.split('/').pop() ?? url;
      if (name.includes('eagle')) {
        return {
          flySpeed: [3.6, 5.6],
          flyAnimSpeed: [0.08, 0.13],
          walkSpeed: [0.45, 1.0],
          walkAnimSpeed: [0.06, 0.1],
          landChance: 0.45,
        };
      }
      if (name.includes('robin')) {
        return {
          flySpeed: [2.4, 4.2],
          flyAnimSpeed: [0.12, 0.18],
          walkSpeed: [0.35, 1.1],
          walkAnimSpeed: [0.08, 0.13],
          landChance: 0.65,
        };
      }
      // Default small birds.
      return {
        flySpeed: [2.6, 4.8],
        flyAnimSpeed: [0.12, 0.2],
        walkSpeed: [0.35, 1.25],
        walkAnimSpeed: [0.08, 0.14],
        landChance: 0.6,
      };
    };

    const birds: BirdSprite[] = [];

    const hide = (sprite: BirdSprite, respawnIn: number = rand(120, 360)) => {
      sprite.visible = false;
      sprite.stop();
      sprite._respawnIn = respawnIn;
    };

    const setFacingForVelocity = (sprite: BirdSprite) => {
      const movingRight = sprite._vx > 0;
      const desiredFacingRight = movingRight;
      const shouldFlip = DEFAULT_SHEET_FACES_LEFT ? desiredFacingRight : !desiredFacingRight;
      const sign = shouldFlip ? -1 : 1;
      sprite.scale.set(sign * sprite._scale, sprite._scale);
    };

    const setStateFly = (sprite: BirdSprite) => {
      sprite._state = 'fly';
      sprite.textures = sprite._frameset.fly;
      sprite.loop = true;
      sprite.animationSpeed = rand(sprite._tuning.flyAnimSpeed[0], sprite._tuning.flyAnimSpeed[1]);
      sprite.gotoAndPlay(0);
    };

    const setStateWalk = (sprite: BirdSprite) => {
      sprite._state = 'walk';
      sprite.textures = sprite._frameset.walk;
      sprite.loop = true;
      sprite.animationSpeed = rand(sprite._tuning.walkAnimSpeed[0], sprite._tuning.walkAnimSpeed[1]);
      sprite.gotoAndPlay(0);
    };

    const setStateIdle = (sprite: BirdSprite) => {
      sprite._state = 'idle';
      sprite.textures = [sprite._frameset.idle];
      sprite.gotoAndStop(0);
    };

    const spawn = (sprite: BirdSprite) => {
      const w = app.renderer.screen.width;
      const h = app.renderer.screen.height;
      if (w <= 0 || h <= 0) return;

      const margin = 40;
      const dir = Math.random() < 0.5 ? 1 : -1;

      sprite.anchor.set(0.5);
      const candidates = BIRD_SHEET_URLS.filter((url) => !failedSheets.has(url));
      const sheetUrl = (candidates.length > 0 ? candidates : BIRD_SHEET_URLS)[
        (Math.random() * (candidates.length > 0 ? candidates.length : BIRD_SHEET_URLS.length)) | 0
      ]!;
      const frameset = getFramesetSync(sheetUrl);
      if (!frameset) {
        void loadFrameset(sheetUrl);
        hide(sprite, rand(10, 30));
        return;
      }

      sprite._frameset = frameset;
      sprite._tuning = getTuning(sheetUrl);

      sprite._scale = rand(0.9, 1.25);
      sprite._vx = dir * rand(sprite._tuning.flySpeed[0], sprite._tuning.flySpeed[1]);
      sprite._vy = rand(-0.015, 0.015);
      sprite._amp = rand(1.5, 4.0);
      sprite._freq = rand(1.0, 1.8);
      sprite._phase = rand(0, Math.PI * 2);

      // Keep birds in the "sky" portion of the screen.
      sprite._baseY = rand(20, Math.max(40, h * 0.35));
      sprite.x = dir === 1 ? -margin : w + margin;
      sprite.y = sprite._baseY;

      sprite._willLand = Math.random() < sprite._tuning.landChance;
      sprite._landX = rand(w * 0.25, w * 0.75);
      sprite._groundY = rand(h * 0.55, h * 0.82);
      sprite._walkFor = rand(180, 420);
      sprite._idleFor = rand(120, 300);

      sprite.alpha = rand(0.85, 1.0);
      sprite.roundPixels = true;
      setStateFly(sprite);
      setFacingForVelocity(sprite);
      sprite.visible = true;
      sprite._respawnIn = 0;
    };

    for (let i = 0; i < count; i += 1) {
      const sprite = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]) as BirdSprite;
      (sprite as any).eventMode = 'none';
      sprite.interactive = false;
      sprite.interactiveChildren = false;
      sprite.autoUpdate = true;
      container.addChild(sprite);
      birds.push(sprite);
      hide(sprite);
      // Stagger initial spawns.
      sprite._respawnIn = rand(20, 160);
    }

    // Kick off loading early so we don't slice before the images are ready.
    for (const url of BIRD_SHEET_URLS) {
      void loadFrameset(url);
    }

    const tick = (delta: number) => {
      const w = app.renderer.screen.width;
      const h = app.renderer.screen.height;
      if (w <= 0 || h <= 0) return;

      const t = performance.now() * 0.001;
      const margin = 60;

      for (const sprite of birds) {
        if (sprite._respawnIn > 0) {
          sprite._respawnIn -= delta;
          if (sprite._respawnIn <= 0) spawn(sprite);
          continue;
        }

        if (sprite._state === 'fly') {
          sprite.x += sprite._vx * delta;
          sprite._baseY += sprite._vy * delta;
          sprite.y = sprite._baseY + Math.sin(t * sprite._freq + sprite._phase) * sprite._amp;

          if (sprite._willLand) {
            const reachedLandX = sprite._vx > 0 ? sprite.x >= sprite._landX : sprite.x <= sprite._landX;
            if (reachedLandX) {
              sprite._willLand = false;
              sprite._state = 'walk';
              sprite._baseY = sprite._groundY;
              sprite.y = sprite._groundY;
              sprite._amp = rand(0.0, 1.2);
              sprite._freq = rand(1.5, 2.4);
              sprite._phase = rand(0, Math.PI * 2);
              sprite._vy = 0;
              // Different birds will walk at different speeds.
              sprite._vx = Math.sign(sprite._vx) * rand(sprite._tuning.walkSpeed[0], sprite._tuning.walkSpeed[1]);
              setStateWalk(sprite);
              setFacingForVelocity(sprite);
            }
          }
        } else if (sprite._state === 'walk') {
          sprite.x += sprite._vx * delta;
          sprite.y = sprite._baseY + Math.sin(t * sprite._freq + sprite._phase) * sprite._amp;
          sprite._walkFor -= delta;
          if (sprite._walkFor <= 0) {
            sprite._vx = 0;
            setStateIdle(sprite);
          }
        } else if (sprite._state === 'idle') {
          sprite._idleFor -= delta;
          if (sprite._idleFor <= 0) {
            // Take off again (fly out) after idling.
            sprite._vx =
              (Math.random() < 0.5 ? 1 : -1) * rand(sprite._tuning.flySpeed[0], sprite._tuning.flySpeed[1]);
            sprite._vy = rand(-0.02, -0.005);
            sprite._amp = rand(1.0, 3.0);
            sprite._freq = rand(1.0, 1.6);
            sprite._phase = rand(0, Math.PI * 2);
            sprite._baseY = Math.min(sprite._baseY, h * 0.45);
            setStateFly(sprite);
            setFacingForVelocity(sprite);
          }
        }

        const offRight = sprite.x > w + margin;
        const offLeft = sprite.x < -margin;
        const offTop = sprite.y < -margin;
        const offBottom = sprite.y > h + margin;
        if (offRight || offLeft || offTop || offBottom) {
          hide(sprite);
        }
      }
    };

    container.__birdFxTick = tick;
    app.ticker.add(tick);
    return container;
  },

  applyProps: () => {
    // No-op: Bird FX is fully managed internally and we don't want to pass unknown props
    // (like `count`) onto the underlying PIXI.Container (which spams console warnings).
  },

  willUnmount: (container: BirdFxContainer) => {
    const app = container.__birdFxApp;
    const tick = container.__birdFxTick;
    if (app && tick) {
      app.ticker.remove(tick);
    }
    container.destroy({ children: true });
  },
});

export default function BirdFx(props: { count?: number } = {}) {
  const app = useApp();
  return <BirdFxLayer app={app} count={props.count} />;
}
