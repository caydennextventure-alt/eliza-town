import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { characters as builtInCharacters } from '../../data/characters';
import { standard32x32 } from '../../data/spritesheets/standard32x32';
import { SpritesheetData } from '../../data/spritesheets/types';

const createStandardSpritesheetData = (frameW: number, frameH: number): SpritesheetData => {
  // Calculate scale to fit standard 32px width
  // If frameW is 341 (from 1024px sheet), scale needs to be ~0.1
  const scale = (32 / frameW).toString();
  
  return {
    frames: {
      down: { frame: { x: 0, y: 0, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      down2: { frame: { x: frameW, y: 0, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      down3: { frame: { x: frameW * 2, y: 0, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      left: { frame: { x: 0, y: frameH, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      left2: { frame: { x: frameW, y: frameH, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      left3: { frame: { x: frameW * 2, y: frameH, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      right: { frame: { x: 0, y: frameH * 2, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      right2: { frame: { x: frameW, y: frameH * 2, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      right3: { frame: { x: frameW * 2, y: frameH * 2, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      up: { frame: { x: 0, y: frameH * 3, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      up2: { frame: { x: frameW, y: frameH * 3, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
      up3: { frame: { x: frameW * 2, y: frameH * 3, w: frameW, h: frameH }, sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0 } },
    },
    meta: { scale },
    animations: {
      left: ['left', 'left2', 'left3'],
      right: ['right', 'right2', 'right3'],
      up: ['up', 'up2', 'up3'],
      down: ['down', 'down2', 'down3'],
    },
  };
};

type CharacterRegistryEntry = {
  spriteId: string;
  displayName: string;
  textureUrl: string | null;
  portraitUrl?: string | null;
  frameWidth: number;
  frameHeight: number;
  framesPerDirection: number;
  directions: number;
  storageId: string;
  isCustom: boolean;
  ownerId: string;
  createdAt: number;
};

export type CharacterDefinition = {
  name: string;
  displayName?: string;
  textureUrl: string;
  portraitUrl?: string;
  spritesheetData: typeof standard32x32;
  speed: number;
  isCustom: boolean;
  ownerId?: string;
};

export const useCharacters = () => {
  const customSprites = useQuery(api.characterSprites.list);
  const isLoading = customSprites === undefined;
  const characters = useMemo(() => {
    const builtIn: CharacterDefinition[] = builtInCharacters.map((character) => ({
      ...character,
      isCustom: false,
    }));
    const custom = (customSprites ?? [])
      .filter(
        (sprite): sprite is CharacterRegistryEntry & { textureUrl: string } =>
          typeof sprite.textureUrl === 'string' && sprite.textureUrl.length > 0,
      )
      .map((sprite): CharacterDefinition => ({
        name: sprite.spriteId,
        displayName: sprite.displayName,
        textureUrl: sprite.textureUrl,
        portraitUrl: sprite.portraitUrl ?? sprite.textureUrl,
        spritesheetData:
          sprite.frameWidth > 0 && sprite.frameHeight > 0
            ? createStandardSpritesheetData(sprite.frameWidth, sprite.frameHeight)
            : standard32x32,
        speed: 0.1,
        isCustom: true,
        ownerId: sprite.ownerId,
      }));
    return [...builtIn, ...custom];
  }, [customSprites]);
  return { characters, isLoading, customSprites: customSprites ?? [] };
};
