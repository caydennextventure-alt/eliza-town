import { Container, Graphics, Sprite } from '@pixi/react';
import { useMemo } from 'react';
import * as PIXI from 'pixi.js';
import type { WorldMap } from '../../convex/aiTown/worldMap';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
const BASE_PATH = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;

const resolveAssetPath = (path: string) => {
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `${BASE_PATH}${encodeURI(path)}`;
};

const NIGHT_OVERLAY_COLOR = 0x0b1320;
const NIGHT_OVERLAY_ALPHA = 0.45;

const LAMP_OBJECT_ID = 'deco-1';
const LAMP_WIDTH_PX = 32;
const LAMP_HEIGHT_PX = 60;

const GLOW_TEXTURE_URL = 'assets/Tileset Asset/animated/glow_256.png';
const SHADE_OVERLAY_URL = 'assets/Tileset Asset/animated/lamp_window_light_overlay.png';

const GLOW_SIZE = 180;
const GLOW_OFFSET_Y = -12;
const GLOW_ALPHA = 0.22;
const GLOW_TINT = 0xffd27a;
const SHADE_ALPHA = 0.85;
const SHADE_TINT = 0xfff1b0;

type LampPlacement = { id: string; x: number; y: number };

export default function NightLighting(props: { map: WorldMap; isNight: boolean }) {
  const { map, isNight } = props;
  const tileDim = map.tileDim;

  const textures = useMemo(() => {
    const glow = PIXI.Texture.from(resolveAssetPath(GLOW_TEXTURE_URL));
    glow.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;

    const shade = PIXI.Texture.from(resolveAssetPath(SHADE_OVERLAY_URL));
    shade.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;

    return { glow, shade };
  }, []);

  const lamps = useMemo<LampPlacement[]>(() => {
    const placements = map.placedObjects ?? [];
    const out: LampPlacement[] = [];
    for (const placement of placements) {
      if (placement.objectId !== LAMP_OBJECT_ID) continue;
      const pixelOffsetX = Number(placement.pixelOffsetX ?? 0);
      const pixelOffsetY = Number(placement.pixelOffsetY ?? 0);
      const footX = placement.col * tileDim + pixelOffsetX + LAMP_WIDTH_PX / 2;
      const footY = (placement.row + 1) * tileDim + pixelOffsetY;
      out.push({ id: placement.id, x: footX, y: footY });
    }
    return out;
  }, [map.placedObjects, tileDim]);

  if (!isNight) return null;

  const worldWidthPx = map.width * tileDim;
  const worldHeightPx = map.height * tileDim;

  return (
    <Container eventMode="none" interactive={false} interactiveChildren={false}>
      <Graphics
        draw={(g) => {
          g.clear();
          g.beginFill(NIGHT_OVERLAY_COLOR, 1);
          g.drawRect(0, 0, worldWidthPx, worldHeightPx);
          g.endFill();
        }}
        alpha={NIGHT_OVERLAY_ALPHA}
        blendMode={PIXI.BLEND_MODES.MULTIPLY}
        eventMode="none"
        interactive={false}
        interactiveChildren={false}
      />

      {lamps.map((lamp) => (
        <Container
          key={lamp.id}
          x={lamp.x}
          y={lamp.y}
          eventMode="none"
          interactive={false}
          interactiveChildren={false}
        >
          <Sprite
            texture={textures.glow}
            anchor={0.5}
            x={0}
            y={GLOW_OFFSET_Y}
            width={GLOW_SIZE}
            height={GLOW_SIZE}
            alpha={GLOW_ALPHA}
            tint={GLOW_TINT}
            blendMode={PIXI.BLEND_MODES.ADD}
            eventMode="none"
            interactive={false}
            interactiveChildren={false}
          />
          <Sprite
            texture={textures.shade}
            anchor={{ x: 0.5, y: 1 }}
            x={0}
            y={0}
            width={LAMP_WIDTH_PX}
            height={LAMP_HEIGHT_PX}
            alpha={SHADE_ALPHA}
            tint={SHADE_TINT}
            blendMode={PIXI.BLEND_MODES.ADD}
            eventMode="none"
            interactive={false}
            interactiveChildren={false}
          />
        </Container>
      ))}
    </Container>
  );
}
