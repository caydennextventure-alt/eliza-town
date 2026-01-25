import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { playerId } from '../aiTown/ids';

export const elizaAgentTables = {
  elizaAgents: defineTable({
    playerId: v.optional(playerId),
    worldId: v.id('worlds'),
    elizaAgentId: v.string(),     // UUID from ElizaOS
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
    name: v.string(),
    bio: v.string(),
    personality: v.array(v.string()), // ['Friendly', 'Curious']
    createdAt: v.number(),
  })
    .index('playerId', ['playerId'])
    .index('elizaAgentId', ['elizaAgentId'])
    .index('worldId', ['worldId']),
};
