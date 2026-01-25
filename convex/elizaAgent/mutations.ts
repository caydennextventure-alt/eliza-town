import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';

export const saveMapping = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.optional(v.id('players')), // Using generic ID type as it maps to players table
    elizaAgentId: v.string(),
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
    name: v.string(),
    bio: v.string(),
    personality: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('elizaAgents', {
      playerId: args.playerId,
      worldId: args.worldId,
      elizaAgentId: args.elizaAgentId,
      elizaServerUrl: args.elizaServerUrl,
      elizaAuthToken: args.elizaAuthToken,
      name: args.name,
      bio: args.bio,
      personality: args.personality,
      createdAt: Date.now(),
    });
  },
});
