import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { playerId } from '../aiTown/ids';

export const elizaAgentTables = {
  elizaAgents: defineTable({
    playerId: v.optional(playerId),
    worldId: v.id('worlds'),
    elizaAgentId: v.string(),     // UUID from ElizaOS
    elizaWorldId: v.optional(v.string()),
    elizaUserId: v.optional(v.string()),
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
    communicationMode: v.optional(v.string()),
    communicationVerifiedAt: v.optional(v.number()),
    provider: v.optional(v.union(v.literal('server'), v.literal('cloud'))),
    cloudApiKey: v.optional(v.string()),
    name: v.string(),
    bio: v.string(),
    personality: v.array(v.string()), // ['Friendly', 'Curious']
    createdAt: v.number(),
  })
    .index('playerId', ['playerId'])
    .index('elizaAgentId', ['elizaAgentId'])
    .index('worldId', ['worldId'])
    .index('byWorldAndName', ['worldId', 'name']),
  elizaSessions: defineTable({
    elizaAgentId: v.string(),
    conversationId: v.string(),
    sessionId: v.string(),
    userId: v.string(),
    channelId: v.optional(v.string()),
    elizaServerUrl: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    lastUsedAt: v.number(),
  })
    .index('byAgentAndConversation', ['elizaAgentId', 'conversationId'])
    .index('byAgent', ['elizaAgentId']),
  elizaInstallations: defineTable({
    key: v.string(),
    userId: v.string(),
    createdAt: v.number(),
  }).index('byKey', ['key']),
};
