import { ConvexError, v } from 'convex/values';
import { mutation } from './_generated/server';
import { getOptionalUserId } from './util/auth';

const tileRectHitbox = v.object({
  kind: v.literal('tileRect'),
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
});

const interactableValidator = v.object({
  objectInstanceId: v.string(),
  objectType: v.string(),
  placedObjectId: v.optional(v.string()),
  hitbox: tileRectHitbox,
  interactionRadius: v.optional(v.number()),
  displayName: v.optional(v.string()),
  metadata: v.optional(v.any()),
});

const placedObjectValidator = v.object({
  id: v.string(),
  objectId: v.string(),
  col: v.number(),
  row: v.number(),
  rotation: v.optional(v.number()),
  pixelOffsetX: v.optional(v.number()),
  pixelOffsetY: v.optional(v.number()),
});

const MAX_INTERACTABLES = 200;
const MAX_PLACED_OBJECTS = 10000;

function assertFiniteNumber(value: number, name: string) {
  if (!Number.isFinite(value)) {
    throw new ConvexError(`Invalid ${name}`);
  }
}

function allowUnauthenticatedEdits(): boolean {
  return process.env.ALLOW_UNAUTHENTICATED_TOWN_EDIT === '1';
}

export const upsertInteractable = mutation({
  args: {
    worldId: v.id('worlds'),
    interactable: interactableValidator,
  },
  handler: async (ctx, args) => {
    const actorId = await getOptionalUserId(ctx);
    if (!actorId && !allowUnauthenticatedEdits()) {
      throw new ConvexError('Not logged in');
    }

    const mapDoc = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!mapDoc) {
      throw new ConvexError(`No map for world: ${args.worldId}`);
    }

    const placedIds = new Set((mapDoc.placedObjects ?? []).map((placement: any) => placement.id));
    const referenceId = args.interactable.placedObjectId ?? args.interactable.objectInstanceId;
    if (!placedIds.has(referenceId)) {
      throw new ConvexError('Interactable must reference an existing placed object.');
    }

    const { hitbox } = args.interactable;
    assertFiniteNumber(hitbox.x, 'hitbox.x');
    assertFiniteNumber(hitbox.y, 'hitbox.y');
    assertFiniteNumber(hitbox.w, 'hitbox.w');
    assertFiniteNumber(hitbox.h, 'hitbox.h');

    if (hitbox.w <= 0 || hitbox.h <= 0) {
      throw new ConvexError('Hitbox must have positive size.');
    }
    if (hitbox.x < 0 || hitbox.y < 0) {
      throw new ConvexError('Hitbox must be within the map.');
    }
    if (hitbox.x + hitbox.w > mapDoc.width || hitbox.y + hitbox.h > mapDoc.height) {
      throw new ConvexError('Hitbox must be within the map.');
    }

    if (args.interactable.objectInstanceId.length > 128) {
      throw new ConvexError('objectInstanceId too long.');
    }
    if (args.interactable.objectType.length > 64) {
      throw new ConvexError('objectType too long.');
    }

    const existing = mapDoc.interactables ?? [];
    const next = existing.filter((item: any) => item.objectInstanceId !== args.interactable.objectInstanceId);
    next.push(args.interactable);
    if (next.length > MAX_INTERACTABLES) {
      throw new ConvexError('Too many interactables.');
    }

    await ctx.db.patch(mapDoc._id, { interactables: next });
  },
});

export const removeInteractable = mutation({
  args: {
    worldId: v.id('worlds'),
    objectInstanceId: v.string(),
  },
  handler: async (ctx, args) => {
    const actorId = await getOptionalUserId(ctx);
    if (!actorId && !allowUnauthenticatedEdits()) {
      throw new ConvexError('Not logged in');
    }

    const mapDoc = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!mapDoc) {
      throw new ConvexError(`No map for world: ${args.worldId}`);
    }

    const next = (mapDoc.interactables ?? []).filter((item: any) => item.objectInstanceId !== args.objectInstanceId);
    await ctx.db.patch(mapDoc._id, { interactables: next });
  },
});

export const upsertPlacedObject = mutation({
  args: {
    worldId: v.id('worlds'),
    placement: placedObjectValidator,
  },
  handler: async (ctx, args) => {
    const actorId = await getOptionalUserId(ctx);
    if (!actorId && !allowUnauthenticatedEdits()) {
      throw new ConvexError('Not logged in');
    }

    const mapDoc = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!mapDoc) {
      throw new ConvexError(`No map for world: ${args.worldId}`);
    }

    const { placement } = args;
    if (placement.id.length > 128) throw new ConvexError('placement.id too long.');
    if (placement.objectId.length > 128) throw new ConvexError('placement.objectId too long.');
    assertFiniteNumber(placement.col, 'placement.col');
    assertFiniteNumber(placement.row, 'placement.row');
    if (placement.col < 0 || placement.row < 0 || placement.col >= mapDoc.width || placement.row >= mapDoc.height) {
      throw new ConvexError('Placement must be within the map.');
    }

    const existing = mapDoc.placedObjects ?? [];
    const next = existing.filter((item: any) => item.id !== placement.id);
    next.push(placement);
    if (next.length > MAX_PLACED_OBJECTS) {
      throw new ConvexError('Too many placed objects.');
    }

    await ctx.db.patch(mapDoc._id, { placedObjects: next });
  },
});

export const removePlacedObject = mutation({
  args: {
    worldId: v.id('worlds'),
    placementId: v.string(),
  },
  handler: async (ctx, args) => {
    const actorId = await getOptionalUserId(ctx);
    if (!actorId && !allowUnauthenticatedEdits()) {
      throw new ConvexError('Not logged in');
    }

    const mapDoc = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!mapDoc) {
      throw new ConvexError(`No map for world: ${args.worldId}`);
    }

    const next = (mapDoc.placedObjects ?? []).filter((item: any) => item.id !== args.placementId);
    await ctx.db.patch(mapDoc._id, { placedObjects: next });
  },
});
