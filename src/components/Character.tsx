import { BaseTexture, ISpritesheetData, Spritesheet } from 'pixi.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatedSprite, Container, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';

// Cache for parsed spritesheets to avoid duplicate texture cache entries
const spritesheetCache = new Map<string, Spritesheet>();

export const Character = ({
  textureUrl,
  spritesheetData,
  x,
  y,
  orientation,
  isMoving = false,
  isThinking = false,
  isSpeaking = false,
  emoji = '',
  isViewer = false,
  speed = 0.1,
  onClick,
}: {
  // Path to the texture packed image.
  textureUrl: string;
  // The data for the spritesheet.
  spritesheetData: ISpritesheetData;
  // The pose of the NPC.
  x: number;
  y: number;
  orientation: number;
  isMoving?: boolean;
  // Shows a thought bubble if true.
  isThinking?: boolean;
  // Shows a speech bubble if true.
  isSpeaking?: boolean;
  emoji?: string;
  // Highlights the player.
  isViewer?: boolean;
  // The speed of the animation. Can be tuned depending on the side and speed of the NPC.
  speed?: number;
  onClick: () => void;
}) => {
  const [spriteSheet, setSpriteSheet] = useState<Spritesheet>();
  useEffect(() => {
    const parseSheet = async () => {
      // Check if we already have this spritesheet cached
      const cached = spritesheetCache.get(textureUrl);
      if (cached) {
        setSpriteSheet(cached);
        return;
      }

      // Create spritesheet data with unique frame names prefixed by textureUrl
      const uniqueSpritesheetData: ISpritesheetData = {
        ...spritesheetData,
        frames: Object.fromEntries(
          Object.entries(spritesheetData.frames).map(([key, value]) => [
            `${textureUrl}_${key}`,
            value,
          ])
        ),
        animations: spritesheetData.animations
          ? Object.fromEntries(
              Object.entries(spritesheetData.animations).map(([key, frames]) => [
                key,
                frames.map((frame) => `${textureUrl}_${frame}`),
              ])
            )
          : undefined,
      };

      const sheet = new Spritesheet(
        BaseTexture.from(textureUrl, {
          scaleMode: PIXI.SCALE_MODES.NEAREST,
        }),
        uniqueSpritesheetData,
      );
      await sheet.parse();
      spritesheetCache.set(textureUrl, sheet);
      setSpriteSheet(sheet);
    };
    void parseSheet();
  }, [textureUrl, spritesheetData]);

  // The first "left" is "right" but reflected.
  const roundedOrientation = Math.floor(orientation / 90);
  const direction = ['right', 'down', 'left', 'up'][roundedOrientation];

  // Prevents the animation from stopping when the texture changes
  // (see https://github.com/pixijs/pixi-react/issues/359)
  const ref = useRef<PIXI.AnimatedSprite | null>(null);
  useEffect(() => {
    if (isMoving) {
      ref.current?.play();
    }
  }, [direction, isMoving]);

  if (!spriteSheet) return null;

  let _blockOffset = { x: 0, y: 0 };
  switch (roundedOrientation) {
    case 2:
      _blockOffset = { x: -20, y: 0 };
      break;
    case 0:
      _blockOffset = { x: 20, y: 0 };
      break;
    case 3:
      _blockOffset = { x: 0, y: -20 };
      break;
    case 1:
      _blockOffset = { x: 0, y: 20 };
      break;
  }

  return (
    <Container x={x} y={y} eventMode="static" pointerdown={onClick} cursor="pointer">
      {isThinking && (
        // TODO: We'll eventually have separate assets for thinking and speech animations.
        <Text x={-20} y={-10} scale={{ x: -0.8, y: 0.8 }} text={'💭'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isSpeaking && (
        // TODO: We'll eventually have separate assets for thinking and speech animations.
        <Text x={18} y={-10} scale={0.8} text={'💬'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isViewer && <ViewerIndicator />}
      <AnimatedSprite
        ref={ref}
        isPlaying={isMoving}
        textures={spriteSheet.animations[direction]}
        animationSpeed={speed}
        anchor={{ x: 0.5, y: 0.5 }}
      />
      {emoji && (
        <Text x={0} y={-24} scale={{ x: -0.8, y: 0.8 }} text={emoji} anchor={{ x: 0.5, y: 0.5 }} />
      )}
    </Container>
  );
};

function ViewerIndicator() {
  const draw = useCallback((g: PIXI.Graphics) => {
    g.clear();
    g.beginFill(0xffff0b, 0.5);
    g.drawRoundedRect(-10, 10, 20, 10, 100);
    g.endFill();
  }, []);

  return <Graphics draw={draw} />;
}
