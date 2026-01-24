import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';

export const consume = internalMutation({
  args: {
    key: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const { key, limit, windowMs } = args;
    if (limit <= 0 || windowMs <= 0) {
      throw new Error('Invalid rate limit configuration.');
    }
    const now = Date.now();
    const windowStart = now - (now % windowMs);
    const bucket = await ctx.db
      .query('rateLimitBuckets')
      .withIndex('by_key_window', (q) => q.eq('key', key).eq('windowStart', windowStart))
      .unique();
    if (!bucket) {
      await ctx.db.insert('rateLimitBuckets', { key, windowStart, count: 1 });
      return { remaining: limit - 1, resetAt: windowStart + windowMs };
    }
    if (bucket.count >= limit) {
      throw new ConvexError('Rate limit exceeded. Please try again later.');
    }
    await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
    return { remaining: limit - (bucket.count + 1), resetAt: windowStart + windowMs };
  },
});

