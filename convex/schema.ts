import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { elizaAgentTables } from './elizaAgent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';

const werewolfTables = {
  werewolfQueue: defineTable({
    queueId: v.string(),
    worldId: v.id('worlds'),
    playerId,
    displayName: v.string(),
    joinedAt: v.number(),
    idempotencyKey: v.optional(v.string()),
  })
    .index('byQueueAndJoinedAt', ['queueId', 'joinedAt'])
    .index('byQueueAndPlayer', ['queueId', 'playerId']),
  werewolfMatches: defineTable({
    worldId: v.id('worlds'),
    queueId: v.string(),
    buildingInstanceId: v.string(),
    phase: v.union(
      v.literal('LOBBY'),
      v.literal('NIGHT'),
      v.literal('DAY_ANNOUNCE'),
      v.literal('DAY_OPENING'),
      v.literal('DAY_DISCUSSION'),
      v.literal('DAY_VOTE'),
      v.literal('DAY_RESOLUTION'),
      v.literal('ENDED'),
    ),
    dayNumber: v.number(),
    phaseStartedAt: v.number(),
    phaseEndsAt: v.number(),
    playersAlive: v.number(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    winner: v.optional(v.union(v.literal('VILLAGERS'), v.literal('WEREWOLVES'))),
    publicSummary: v.string(),
    nightNumber: v.number(),
    lastAdvanceJobAt: v.optional(v.number()),
  })
    .index('byWorldAndPhase', ['worldId', 'phase'])
    .index('byQueueAndCreated', ['queueId', 'startedAt']),
  werewolfPlayers: defineTable({
    matchId: v.string(),
    playerId,
    displayName: v.string(),
    seat: v.number(),
    role: v.union(
      v.literal('VILLAGER'),
      v.literal('WEREWOLF'),
      v.literal('SEER'),
      v.literal('DOCTOR'),
    ),
    alive: v.boolean(),
    eliminatedAt: v.optional(v.number()),
    revealedRole: v.optional(v.boolean()),
    ready: v.boolean(),
    missedResponses: v.optional(v.number()),
    doctorLastProtectedPlayerId: v.optional(v.string()),
    seerHistory: v.array(
      v.object({
        night: v.number(),
        targetPlayerId: v.string(),
        result: v.union(v.literal('WEREWOLF'), v.literal('NOT_WEREWOLF')),
      }),
    ),
    didOpeningForDay: v.optional(v.number()),
    voteTargetPlayerId: v.optional(v.union(v.string(), v.null())),
    lastPublicMessageAt: v.optional(v.number()),
    lastWolfChatAt: v.optional(v.number()),
    nightAction: v.optional(
      v.object({
        wolfKillTargetPlayerId: v.optional(v.string()),
        seerInspectTargetPlayerId: v.optional(v.string()),
        doctorProtectTargetPlayerId: v.optional(v.string()),
      }),
    ),
    nightSubmittedAt: v.optional(
      v.object({
        wolfKill: v.optional(v.number()),
        seerInspect: v.optional(v.number()),
        doctorProtect: v.optional(v.number()),
      }),
    ),
  })
    .index('byMatchAndPlayer', ['matchId', 'playerId'])
    .index('byMatchAndSeat', ['matchId', 'seat'])
    .index('byPlayerId', ['playerId']),
  werewolfEvents: defineTable({
    matchId: v.string(),
    seq: v.number(),
    at: v.number(),
    type: v.string(),
    visibility: v.union(
      v.literal('PUBLIC'),
      v.literal('WOLVES'),
      v.object({
        kind: v.literal('PLAYER_PRIVATE'),
        playerId,
      }),
    ),
    payload: v.any(),
  })
    .index('byMatchAndSeq', ['matchId', 'seq'])
    .index('byMatchAndAt', ['matchId', 'at']),
  werewolfRoundRuns: defineTable({
    matchId: v.string(),
    phase: v.string(),
    phaseStartedAt: v.number(),
    roundIndex: v.number(),
    scheduledAt: v.number(),
    startedAt: v.number(),
  })
    .index('byMatchPhaseRound', ['matchId', 'phase', 'phaseStartedAt', 'roundIndex'])
    .index('byMatch', ['matchId']),
  werewolfBuildings: defineTable({
    matchId: v.string(),
    worldId: v.id('worlds'),
    x: v.number(),
    y: v.number(),
    label: v.string(),
    createdAt: v.number(),
  })
    .index('byWorld', ['worldId'])
    .index('byMatch', ['matchId']),
  werewolfIdempotency: defineTable({
    scope: v.string(),
    key: v.string(),
    playerId,
    matchId: v.optional(v.string()),
    result: v.any(),
    createdAt: v.number(),
  }).index('byScopeAndKey', ['scope', 'key']),
};

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

  ...werewolfTables,
  ...agentTables,
  ...aiTownTables,
  ...engineTables,
  ...elizaAgentTables,
});
