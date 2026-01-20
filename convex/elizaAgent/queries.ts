import { v } from 'convex/values';
import { internalQuery } from '../_generated/server';
import { playerId } from '../aiTown/ids';

export const getByPlayerId = internalQuery({
  args: {
    playerId,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('elizaAgents')
      .withIndex('playerId', (q) => q.eq('playerId', args.playerId))
      .first();
  },
});
