/**
 * Agent Types - Shared between frontend and backend
 * 
 * This file contains ONLY types and classes that can be safely imported
 * in the browser. NO server-side imports (internalMutation, internalQuery, etc.)
 */

import { ObjectType, v } from 'convex/values';
import { GameId, parseGameId } from './ids';
import { agentId, conversationId, playerId } from './ids';

// =============================================================================
// Serialized Agent Schema (for Convex values)
// =============================================================================

export const serializedAgent = {
  id: agentId,
  playerId: playerId,
  toRemember: v.optional(conversationId),
  lastConversation: v.optional(v.number()),
  lastInviteAttempt: v.optional(v.number()),
  inProgressOperation: v.optional(
    v.object({
      name: v.string(),
      operationId: v.string(),
      started: v.number(),
    }),
  ),
};

export type SerializedAgent = ObjectType<typeof serializedAgent>;

// =============================================================================
// Agent Class (for deserialization - NO server dependencies)
// =============================================================================

export class Agent {
  id: GameId<'agents'>;
  playerId: GameId<'players'>;
  toRemember?: GameId<'conversations'>;
  lastConversation?: number;
  lastInviteAttempt?: number;
  inProgressOperation?: {
    name: string;
    operationId: string;
    started: number;
  };

  constructor(serialized: SerializedAgent) {
    const { id, lastConversation, lastInviteAttempt, inProgressOperation } = serialized;
    const playerIdParsed = parseGameId('players', serialized.playerId);
    this.id = parseGameId('agents', id);
    this.playerId = playerIdParsed;
    this.toRemember =
      serialized.toRemember !== undefined
        ? parseGameId('conversations', serialized.toRemember)
        : undefined;
    this.lastConversation = lastConversation;
    this.lastInviteAttempt = lastInviteAttempt;
    this.inProgressOperation = inProgressOperation;
  }

  serialize(): SerializedAgent {
    return {
      id: this.id,
      playerId: this.playerId,
      toRemember: this.toRemember,
      lastConversation: this.lastConversation,
      lastInviteAttempt: this.lastInviteAttempt,
      inProgressOperation: this.inProgressOperation,
    };
  }
}
