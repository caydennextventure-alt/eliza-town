import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';

async function assertBoardInteractable(ctx: any, worldId: any, objectInstanceId: string) {
  const mapDoc = await ctx.db
    .query('maps')
    .withIndex('worldId', (q: any) => q.eq('worldId', worldId))
    .first();
  if (!mapDoc) {
    throw new ConvexError('Map not found');
  }

  const interactable = (mapDoc.interactables ?? []).find(
    (item: any) => item?.objectInstanceId === objectInstanceId,
  );
  if (!interactable) {
    throw new ConvexError('Interactable not found');
  }
  if (interactable.objectType !== 'board') {
    throw new ConvexError('Unsupported template (expected board)');
  }
}

export const getCounter = query({
  args: {
    worldId: v.id('worlds'),
    objectInstanceId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertBoardInteractable(ctx, args.worldId, args.objectInstanceId);
    const doc = await ctx.db
      .query('appCounterStates')
      .withIndex('by_world_object', (q: any) =>
        q.eq('worldId', args.worldId).eq('objectInstanceId', args.objectInstanceId),
      )
      .first();
    return { count: doc?.count ?? 0 };
  },
});

export const incrementCounter = mutation({
  args: {
    worldId: v.id('worlds'),
    objectInstanceId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertBoardInteractable(ctx, args.worldId, args.objectInstanceId);
    const now = Date.now();
    const existing = await ctx.db
      .query('appCounterStates')
      .withIndex('by_world_object', (q: any) =>
        q.eq('worldId', args.worldId).eq('objectInstanceId', args.objectInstanceId),
      )
      .first();
    if (!existing) {
      await ctx.db.insert('appCounterStates', {
        worldId: args.worldId,
        objectInstanceId: args.objectInstanceId,
        count: 1,
        updatedAt: now,
      });
      return { count: 1 };
    }
    const next = (existing.count ?? 0) + 1;
    await ctx.db.patch(existing._id, { count: next, updatedAt: now });
    return { count: next };
  },
});
