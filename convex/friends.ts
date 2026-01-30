import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getOptionalUserId, requireUserId } from './util/auth';

export const listMine = query({
  handler: async (ctx) => {
    const ownerId = await getOptionalUserId(ctx);
    if (!ownerId) {
      return [];
    }
    const rows = await ctx.db
      .query('friendsAllowlist')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .collect();
    return rows.map((row) => row.friendId);
  },
});

export const add = mutation({
  args: {
    friendId: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx, 'Not logged in');
    const friendId = args.friendId.trim();
    if (!friendId) {
      throw new ConvexError('Missing friendId.');
    }
    if (friendId === ownerId) {
      throw new ConvexError('You cannot add yourself.');
    }
    const existing = await ctx.db
      .query('friendsAllowlist')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId).eq('friendId', friendId))
      .unique();
    if (existing) {
      return { ok: true };
    }
    await ctx.db.insert('friendsAllowlist', { ownerId, friendId, createdAt: Date.now() });
    return { ok: true };
  },
});

export const remove = mutation({
  args: {
    friendId: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx, 'Not logged in');
    const friendId = args.friendId.trim();
    const existing = await ctx.db
      .query('friendsAllowlist')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId).eq('friendId', friendId))
      .unique();
    if (!existing) {
      return { ok: true };
    }
    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});
