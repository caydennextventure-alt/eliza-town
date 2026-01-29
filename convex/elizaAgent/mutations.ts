import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { playerId } from '../aiTown/ids';

export const saveMapping = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.optional(playerId),
    elizaAgentId: v.string(),
    elizaWorldId: v.optional(v.string()),
    elizaUserId: v.optional(v.string()),
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
    communicationMode: v.optional(v.string()),
    communicationVerifiedAt: v.optional(v.number()),
    name: v.string(),
    bio: v.string(),
    personality: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('elizaAgents')
      .withIndex('byWorldAndName', (q) => q.eq('worldId', args.worldId).eq('name', args.name))
      .order('desc')
      .first();
    if (existing) {
      const update: Record<string, unknown> = {
        elizaAgentId: args.elizaAgentId,
        name: args.name,
        bio: args.bio,
        personality: args.personality,
      };
      if (args.playerId !== undefined) {
        update.playerId = args.playerId;
      }
      if (args.elizaServerUrl !== undefined) {
        update.elizaServerUrl = args.elizaServerUrl;
      }
      if (args.elizaAuthToken !== undefined) {
        update.elizaAuthToken = args.elizaAuthToken;
      }
      if (args.communicationMode !== undefined) {
        update.communicationMode = args.communicationMode;
      }
      if (args.communicationVerifiedAt !== undefined) {
        update.communicationVerifiedAt = args.communicationVerifiedAt;
      }
      if (args.elizaWorldId !== undefined) {
        update.elizaWorldId = args.elizaWorldId;
      }
      if (args.elizaUserId !== undefined) {
        update.elizaUserId = args.elizaUserId;
      }
      await ctx.db.patch(existing._id, update);
      return;
    }
    await ctx.db.insert('elizaAgents', {
      playerId: args.playerId,
      worldId: args.worldId,
      elizaAgentId: args.elizaAgentId,
      elizaWorldId: args.elizaWorldId,
      elizaUserId: args.elizaUserId,
      elizaServerUrl: args.elizaServerUrl,
      elizaAuthToken: args.elizaAuthToken,
      communicationMode: args.communicationMode,
      communicationVerifiedAt: args.communicationVerifiedAt,
      name: args.name,
      bio: args.bio,
      personality: args.personality,
      createdAt: Date.now(),
    });
  },
});

export const linkPlayerId = internalMutation({
  args: {
    elizaAgentId: v.string(),
    playerId,
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query('elizaAgents')
      .withIndex('elizaAgentId', (q) => q.eq('elizaAgentId', args.elizaAgentId))
      .first();
    if (!record) {
      return { updated: false };
    }
    if (record.playerId === args.playerId) {
      return { updated: false };
    }
    await ctx.db.patch(record._id, { playerId: args.playerId });
    return { updated: true };
  },
});

export const updateElizaIdentity = internalMutation({
  args: {
    elizaAgentId: v.string(),
    elizaWorldId: v.optional(v.string()),
    elizaUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query('elizaAgents')
      .withIndex('elizaAgentId', (q) => q.eq('elizaAgentId', args.elizaAgentId))
      .first();
    if (!record) {
      return { updated: false };
    }
    const update: Record<string, unknown> = {};
    if (args.elizaWorldId !== undefined) {
      update.elizaWorldId = args.elizaWorldId;
    }
    if (args.elizaUserId !== undefined) {
      update.elizaUserId = args.elizaUserId;
    }
    if (Object.keys(update).length === 0) {
      return { updated: false };
    }
    await ctx.db.patch(record._id, update);
    return { updated: true };
  },
});

export const saveSession = internalMutation({
  args: {
    elizaAgentId: v.string(),
    conversationId: v.string(),
    sessionId: v.string(),
    userId: v.string(),
    channelId: v.optional(v.string()),
    elizaServerUrl: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    lastUsedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('elizaSessions')
      .withIndex('byAgentAndConversation', (q) =>
        q.eq('elizaAgentId', args.elizaAgentId).eq('conversationId', args.conversationId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        sessionId: args.sessionId,
        userId: args.userId,
        channelId: args.channelId,
        elizaServerUrl: args.elizaServerUrl,
        expiresAt: args.expiresAt,
        lastUsedAt: args.lastUsedAt,
      });
      return { updated: true };
    }
    await ctx.db.insert('elizaSessions', {
      elizaAgentId: args.elizaAgentId,
      conversationId: args.conversationId,
      sessionId: args.sessionId,
      userId: args.userId,
      channelId: args.channelId,
      elizaServerUrl: args.elizaServerUrl,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
      lastUsedAt: args.lastUsedAt,
    });
    return { updated: false };
  },
});

export const saveInstallation = internalMutation({
  args: {
    key: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('elizaInstallations')
      .withIndex('byKey', (q) => q.eq('key', args.key))
      .first();
    if (existing) {
      return { userId: existing.userId, created: false };
    }
    await ctx.db.insert('elizaInstallations', {
      key: args.key,
      userId: args.userId,
      createdAt: Date.now(),
    });
    return { userId: args.userId, created: true };
  },
});
