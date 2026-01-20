import { ObjectType, v } from 'convex/values';

export const serializedCharacterSprite = {
  spriteId: v.string(),
  displayName: v.string(),
  storageId: v.string(),
  frameWidth: v.number(),
  frameHeight: v.number(),
  framesPerDirection: v.number(),
  directions: v.number(),
  isCustom: v.boolean(),
  ownerId: v.string(),
  createdAt: v.number(),
  portraitStorageId: v.optional(v.string()),
};

export type SerializedCharacterSprite = ObjectType<typeof serializedCharacterSprite>;
