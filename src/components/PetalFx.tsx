import { PixiComponent, useApp } from '@pixi/react';
import { Application } from 'pixi.js';
import * as PIXI from 'pixi.js';

const PETAL_TEXTURES = [
  'assets/Tileset Asset/animated/petal_01.png',
  'assets/Tileset Asset/animated/petal_02.png',
  'assets/Tileset Asset/animated/petal_03.png',
  'assets/Tileset Asset/animated/petal_04.png',
  'assets/Tileset Asset/animated/petal_05.png',
  'assets/Tileset Asset/animated/petal_06.png',
];

const BLOSSOM_TEXTURES = [
  'assets/Tileset Asset/animated/blossom_01.png',
  'assets/Tileset Asset/animated/blossom_02.png',
];

const COUNT_DEFAULT = 50;
const SCALE_FACTOR = 0.85;

const BASE_URL = import.meta.env.BASE_URL ?? '/';
const BASE_PATH = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;

const resolveAssetPath = (path: string) => {
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `${BASE_PATH}${encodeURI(path)}`;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

type PetalSprite = PIXI.Sprite & {
  _vy: number;
  _vx: number;
  _amp: number;
  _freq: number;
  _phase: number;
  _spin: number;
  _isBlossom: boolean;
};

type PetalFxContainer = PIXI.Container & {
  __petalFxApp?: Application;
  __petalFxTick?: (delta: number) => void;
};

type PetalFxProps = {
  app: Application;
  count?: number;
};

const PetalFxLayer = PixiComponent('PetalFxLayer', {
  create: (props: PetalFxProps) => {
    const { app, count = COUNT_DEFAULT } = props;

    const container = new PIXI.Container() as PetalFxContainer;
    container.__petalFxApp = app;
    // Ensure petals never intercept clicks/dragging on the world.
    (container as any).eventMode = 'none';
    container.interactive = false;
    container.interactiveChildren = false;

    const petalTextures = PETAL_TEXTURES.map((path) => {
      const texture = PIXI.Texture.from(resolveAssetPath(path));
      texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
      return texture;
    });
    const blossomTextures = BLOSSOM_TEXTURES.map((path) => {
      const texture = PIXI.Texture.from(resolveAssetPath(path));
      texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
      return texture;
    });

    const petals: PetalSprite[] = [];

    const spawn = (sprite: PetalSprite) => {
      const w = app.renderer.screen.width;
      const h = app.renderer.screen.height;

      const isBlossom = Math.random() < 0.04;
      sprite.texture = isBlossom
        ? blossomTextures[(Math.random() * blossomTextures.length) | 0]
        : petalTextures[(Math.random() * petalTextures.length) | 0];

      sprite.anchor.set(0.5);
      sprite.x = rand(-60, w + 60);
      sprite.y = rand(-260, -60);

      sprite._vy = rand(0.55, 1.35) * (isBlossom ? 0.85 : 1.0);
      sprite._vx = rand(-0.05, 0.18);
      sprite._amp = rand(6, 22);
      sprite._freq = rand(0.01, 0.02);
      sprite._phase = rand(0, Math.PI * 2);
      sprite._spin = rand(-0.03, 0.03) * (isBlossom ? 0.6 : 1.0);
      sprite._isBlossom = isBlossom;

      const sc = rand(0.75, 1.15) * SCALE_FACTOR * (isBlossom ? 1.2 : 1.0);
      sprite.scale.set(sc);
      sprite.alpha = rand(0.35, 0.85);
      sprite.rotation = rand(0, Math.PI * 2);

      // Keep pixel art crisp even when moving.
      sprite.roundPixels = true;

      // Avoid blurry resampling when scaled.
      sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;

      // Ensure we spawn evenly across the visible height initially.
      if (h > 0) {
        sprite.y = rand(0, h);
      }
    };

    for (let i = 0; i < count; i += 1) {
      const sprite = new PIXI.Sprite(petalTextures[0]) as PetalSprite;
      container.addChild(sprite);
      spawn(sprite);
      petals.push(sprite);
    }

    const tick = (delta: number) => {
      const w = app.renderer.screen.width;
      const h = app.renderer.screen.height;
      if (w <= 0 || h <= 0) return;

      const t = performance.now() * 0.001;
      const wind = 0.1 + Math.sin(t * 0.35) * 0.08;

      for (const sprite of petals) {
        sprite.y += sprite._vy * delta;

        const sway = Math.sin(sprite.y * sprite._freq + sprite._phase) * sprite._amp;
        sprite.x += (wind + sprite._vx + sway * 0.01) * delta;
        sprite.rotation += sprite._spin * delta;

        if (sprite.y > h + 80 || sprite.x < -120 || sprite.x > w + 120) {
          spawn(sprite);
        }
      }
    };

    container.__petalFxTick = tick;
    app.ticker.add(tick);

    return container;
  },

  willUnmount: (container: PetalFxContainer) => {
    const app = container.__petalFxApp;
    const tick = container.__petalFxTick;
    if (app && tick) {
      app.ticker.remove(tick);
    }
    container.destroy({ children: true });
  },
});

export default function PetalFx(props: { count?: number } = {}) {
  const app = useApp();
  return <PetalFxLayer app={app} count={props.count} />;
}

