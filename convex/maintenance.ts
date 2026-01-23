import { ConvexError, v } from 'convex/values';
import { mutation } from './_generated/server';
import { kickEngine } from './aiTown/main';
import { Id } from './_generated/dataModel';

export const cleanupWorldData = mutation({
  args: {
    worldId: v.optional(v.id('worlds')),
  },
  handler: async (ctx, args) => {
    let worldId = args.worldId;
    if (!worldId) {
      const worldStatus = await ctx.db
        .query('worldStatus')
        .filter((q) => q.eq(q.field('isDefault'), true))
        .first();
      if (!worldStatus) {
        throw new ConvexError('No default world found.');
      }
      worldId = worldStatus.worldId;
    }
    if (!worldId) {
      throw new ConvexError('No world ID resolved.');
    }

    const resolvedWorldId: Id<'worlds'> = worldId;
    const world = await ctx.db.get(resolvedWorldId);
    if (!world) {
      throw new ConvexError(`Invalid world ID: ${worldId}`);
    }

    const playerIds = new Set(world.players.map((player) => player.id));
    const cleanedAgents = world.agents.filter((agent) => playerIds.has(agent.playerId));
    const removedAgentIds = world.agents
      .filter((agent) => !playerIds.has(agent.playerId))
      .map((agent) => agent.id);

    const cleanedConversations = world.conversations.filter((conversation) =>
      conversation.participants.every((member) => playerIds.has(member.playerId)),
    );
    const removedConversationIds = world.conversations
      .filter((conversation) =>
        conversation.participants.some((member) => !playerIds.has(member.playerId)),
      )
      .map((conversation) => conversation.id);

    if (removedAgentIds.length > 0 || removedConversationIds.length > 0) {
      await ctx.db.replace(resolvedWorldId, {
        ...world,
        agents: cleanedAgents,
        conversations: cleanedConversations,
      });
    }

    const agentDescriptions = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', resolvedWorldId))
      .collect();
    const remainingAgentIds = new Set(cleanedAgents.map((agent) => agent.id));
    let removedAgentDescriptions = 0;
    for (const description of agentDescriptions) {
      if (!remainingAgentIds.has(description.agentId)) {
        await ctx.db.delete(description._id);
        removedAgentDescriptions += 1;
      }
    }

    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', resolvedWorldId))
      .collect();
    let removedPlayerDescriptions = 0;
    for (const description of playerDescriptions) {
      if (!playerIds.has(description.playerId)) {
        await ctx.db.delete(description._id);
        removedPlayerDescriptions += 1;
      }
    }

    try {
      await kickEngine(ctx, resolvedWorldId);
    } catch (error) {
      console.warn(`Failed to kick engine for ${resolvedWorldId}:`, error);
    }

    return {
      worldId: resolvedWorldId,
      removedAgentIds,
      removedConversationIds,
      removedAgentDescriptions,
      removedPlayerDescriptions,
    };
  },
});
