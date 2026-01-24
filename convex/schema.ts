import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { elizaAgentTables } from './elizaAgent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';

export default defineSchema({
  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  scriptedObjects: defineTable({
    worldId: v.id('worlds'),
    objectId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    scriptCode: v.string(),
    createdBy: playerId,
    createdAt: v.number(),
    updatedAt: v.number(),
    isEnabled: v.boolean(),
  })
    .index('by_world', ['worldId'])
    .index('by_object', ['worldId', 'objectId']),

  scriptedObjectStates: defineTable({
    scriptedObjectId: v.id('scriptedObjects'),
    stateData: v.any(),
    updatedAt: v.number(),
  }).index('by_object', ['scriptedObjectId']),

  scriptedObjectSessions: defineTable({
    scriptedObjectId: v.id('scriptedObjects'),
    participants: v.array(playerId),
    sessionData: v.any(),
    status: v.union(v.literal('waiting'), v.literal('active'), v.literal('ended')),
    createdAt: v.number(),
  }).index('by_object', ['scriptedObjectId']),

  rateLimitBuckets: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index('by_key_window', ['key', 'windowStart']),

  auditLogs: defineTable({
    actorId: v.string(),
    action: v.string(),
    worldId: v.optional(v.id('worlds')),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('by_actor', ['actorId', 'createdAt'])
    .index('by_world', ['worldId', 'createdAt']),

  friendsAllowlist: defineTable({
    ownerId: v.string(),
    friendId: v.string(),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerId', 'friendId'])
    .index('by_friend', ['friendId', 'ownerId']),

  killSwitches: defineTable({
    key: v.string(),
    disabled: v.boolean(),
    disabledBy: v.optional(v.string()),
    reason: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,
  ...elizaAgentTables,
});
