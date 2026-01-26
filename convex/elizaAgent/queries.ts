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

export const getByElizaAgentId = internalQuery({
  args: {
    elizaAgentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('elizaAgents')
      .withIndex('elizaAgentId', (q) => q.eq('elizaAgentId', args.elizaAgentId))
      .first();
  },
});

export const getByWorldAndName = internalQuery({
  args: {
    worldId: v.id('worlds'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('elizaAgents')
      .withIndex('byWorldAndName', (q) => q.eq('worldId', args.worldId).eq('name', args.name))
      .order('desc')
      .first();
  },
});

export const getInstallation = internalQuery({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('elizaInstallations')
      .withIndex('byKey', (q) => q.eq('key', args.key))
      .first();
  },
});

export const getSessionByConversation = internalQuery({
  args: {
    elizaAgentId: v.string(),
    conversationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('elizaSessions')
      .withIndex('byAgentAndConversation', (q) =>
        q.eq('elizaAgentId', args.elizaAgentId).eq('conversationId', args.conversationId),
      )
      .first();
  },
});
