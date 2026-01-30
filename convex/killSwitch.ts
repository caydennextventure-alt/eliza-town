import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

export const get = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query('killSwitches').withIndex('by_key', (q) => q.eq('key', args.key)).first();
  },
});

export const isDisabled = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query('killSwitches').withIndex('by_key', (q) => q.eq('key', args.key)).first();
    return row?.disabled ?? false;
  },
});

export const setDisabled = internalMutation({
  args: {
    key: v.string(),
    disabledBy: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query('killSwitches').withIndex('by_key', (q) => q.eq('key', args.key)).first();
    if (!existing) {
      await ctx.db.insert('killSwitches', {
        key: args.key,
        disabled: true,
        disabledBy: args.disabledBy,
        reason: args.reason,
        updatedAt: now,
      });
      return;
    }
    await ctx.db.patch(existing._id, {
      disabled: true,
      disabledBy: args.disabledBy,
      reason: args.reason,
      updatedAt: now,
    });
  },
});

export const clear = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query('killSwitches').withIndex('by_key', (q) => q.eq('key', args.key)).first();
    if (!existing) {
      await ctx.db.insert('killSwitches', { key: args.key, disabled: false, updatedAt: now });
      return;
    }
    await ctx.db.patch(existing._id, {
      disabled: false,
      disabledBy: undefined,
      reason: undefined,
      updatedAt: now,
    });
  },
});

