import * as PIXI from 'pixi.js';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
const BASE_PATH = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;

const resolveAssetPath = (path: string) => {
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `${BASE_PATH}${encodeURI(path)}`;
};

type NightLamp = PIXI.Container & {
  _glow?: PIXI.Sprite;
  _lamp?: PIXI.Sprite;
  _shade?: PIXI.Sprite;
  _on?: boolean;
  setOn?: (on: boolean) => void;
};

const DEFAULT_GLOW_TINT = 0xffd27a;
const DEFAULT_SHADE_TINT = 0xfff1b0;

export function createNightLamp({
  x,
  y,
  lampUrl = 'assets/Tileset Asset/decorations/Deco_1.png',
  shadeOverlayUrl = 'assets/Tileset Asset/animated/lamp_window_light_overlay.png',
  groundGlowUrl = 'assets/Tileset Asset/animated/glow_256.png',
  glowSize = 180,
  glowOffsetY = -12,
  lampAlphaOn = 1.0,
  lampAlphaOff = 1.0,
  glowAlphaOn = 0.22,
  shadeAlphaOn = 0.85,
  glowTint = DEFAULT_GLOW_TINT,
  shadeTint = DEFAULT_SHADE_TINT,
}: {
  x: number;
  y: number;
  lampUrl?: string;
  shadeOverlayUrl?: string;
  groundGlowUrl?: string;
  glowSize?: number;
  glowOffsetY?: number;
  lampAlphaOn?: number;
  lampAlphaOff?: number;
  glowAlphaOn?: number;
  shadeAlphaOn?: number;
  glowTint?: number;
  shadeTint?: number;
}) {
  const container = new PIXI.Container() as NightLamp;
  container.position.set(x, y);

  const glow = PIXI.Sprite.from(resolveAssetPath(groundGlowUrl));
  glow.anchor.set(0.5);
  glow.position.set(0, glowOffsetY);
  glow.width = glowSize;
  glow.height = glowSize;
  glow.alpha = 0;
  glow.tint = glowTint;
  glow.blendMode = PIXI.BLEND_MODES.ADD;
  container.addChild(glow);

  const lamp = PIXI.Sprite.from(resolveAssetPath(lampUrl));
  lamp.anchor.set(0.5, 1.0);
  lamp.position.set(0, 0);
  container.addChild(lamp);

  const shade = PIXI.Sprite.from(resolveAssetPath(shadeOverlayUrl));
  shade.anchor.set(0.5, 1.0);
  shade.position.set(0, 0);
  shade.alpha = 0;
  shade.tint = shadeTint;
  shade.blendMode = PIXI.BLEND_MODES.ADD;
  container.addChild(shade);

  container._glow = glow;
  container._lamp = lamp;
  container._shade = shade;
  container._on = false;

  container.setOn = (on: boolean) => {
    container._on = !!on;
    if (container._on) {
      glow.alpha = glowAlphaOn;
      shade.alpha = shadeAlphaOn;
      lamp.alpha = lampAlphaOn;
    } else {
      glow.alpha = 0;
      shade.alpha = 0;
      lamp.alpha = lampAlphaOff;
    }
  };

  container.setOn(false);
  return container;
}

export function createNightOverlay(app: PIXI.Application, { color = 0x0b1320, alpha = 0.45 } = {}) {
  const overlay = new PIXI.Graphics();
  overlay.beginFill(color, alpha);
  overlay.drawRect(0, 0, app.renderer.width, app.renderer.height);
  overlay.endFill();

  (overlay as any).resizeToScreen = () => {
    overlay.clear();
    overlay.beginFill(color, alpha);
    overlay.drawRect(0, 0, app.renderer.width, app.renderer.height);
    overlay.endFill();
  };

  return overlay;
}

export function setNight({
  isNight,
  lamps,
  nightOverlay,
  nightAlpha = 0.45,
}: {
  isNight: boolean;
  lamps?: Array<NightLamp | undefined>;
  nightOverlay?: PIXI.DisplayObject & { alpha: number };
  nightAlpha?: number;
}) {
  if (nightOverlay) nightOverlay.alpha = isNight ? nightAlpha : 0;
  if (lamps && Array.isArray(lamps)) {
    for (const lamp of lamps) {
      lamp?.setOn?.(!!isNight);
    }
  }
}
