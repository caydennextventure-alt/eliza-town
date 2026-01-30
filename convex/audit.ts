import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

export const log = internalMutation({
  args: {
    actorId: v.string(),
    action: v.string(),
    worldId: v.optional(v.id('worlds')),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('auditLogs', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

