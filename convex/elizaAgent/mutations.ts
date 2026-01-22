import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';

export const saveMapping = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.optional(v.id('players')), // Using generic ID type as it maps to players table
    elizaAgentId: v.string(),
    name: v.string(),
    bio: v.string(),
    personality: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('elizaAgents', {
      playerId: args.playerId,
      worldId: args.worldId,
      elizaAgentId: args.elizaAgentId,
      name: args.name,
      bio: args.bio,
      personality: args.personality,
      createdAt: Date.now(),
    });
  },
});

export const createAgent = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    name: v.string(),
    bio: v.string(),
    personality: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if agent already exists for this player
    const existing = await ctx.db
      .query('elizaAgents')
      .withIndex('playerId', (q) => q.eq('playerId', args.playerId))
      .first();

    if (existing) {
      // Update existing agent
      await ctx.db.patch(existing._id, {
        name: args.name,
        bio: args.bio,
        personality: args.personality,
      });
      return existing._id;
    }

    // Create new agent
    const id = await ctx.db.insert('elizaAgents', {
      playerId: args.playerId,
      worldId: args.worldId,
      elizaAgentId: `eliza-${args.playerId}`,
      name: args.name,
      bio: args.bio,
      personality: args.personality,
      createdAt: Date.now(),
    });
    
    return id;
  },
});
