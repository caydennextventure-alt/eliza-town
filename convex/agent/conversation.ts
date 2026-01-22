/**
 * Agent Conversation - 100% ElizaOS Powered
 * 
 * ALL conversation logic uses ElizaOS runtime.
 * NO chatCompletion fallback - ElizaOS only.
 */

import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';

type MessageWithAuthor = Doc<'messages'> & { authorName: string };
import { ActionCtx, internalQuery } from '../_generated/server';
import { api, internal } from '../_generated/api';
import { GameId, conversationId, playerId } from '../aiTown/ids';

const selfInternal = internal.agent.conversation;

// =============================================================================
// Start Conversation Message (ElizaOS ONLY)
// =============================================================================

export async function startConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );

  // Use ElizaOS (NO fallback)
  const response = await ctx.runAction(internal.elizaAgent.actions.generateResponse, {
    playerId: playerId,
    conversationHistory: [],
    lastMessage: {
      from: otherPlayer.name,
      text: `*${otherPlayer.name} approaches you*`,
      timestamp: Date.now(),
    },
  });
  
  console.log(`[ElizaOS] ${player.name} starting conversation: "${response}"`);
  return response || `Hello ${otherPlayer.name}!`;
}

// =============================================================================
// Continue Conversation Message (ElizaOS ONLY)
// =============================================================================

export async function continueConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );

  // Get conversation history
  const messages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  
  if (messages.length === 0) {
    return `Hello ${otherPlayer.name}!`;
  }
  
  const lastMessage = messages[messages.length - 1];
  
  // Build conversation history for ElizaOS
  const conversationHistory = messages.slice(0, -1).map((m: MessageWithAuthor) => ({
    from: m.author === player.id ? player.name : otherPlayer.name,
    text: m.text,
    timestamp: m._creationTime || Date.now(),
  }));

  // Use ElizaOS (NO fallback)
  const response = await ctx.runAction(internal.elizaAgent.actions.generateResponse, {
    playerId: playerId,
    conversationHistory,
    lastMessage: {
      from: lastMessage.author === player.id ? player.name : otherPlayer.name,
      text: lastMessage.text,
      timestamp: lastMessage._creationTime || Date.now(),
    },
  });

  console.log(`[ElizaOS] ${player.name} continues: "${response}"`);
  return response || "...";
}

// =============================================================================
// Leave Conversation Message (ElizaOS ONLY)
// =============================================================================

export async function leaveConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );

  // Get conversation history
  const messages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  const conversationHistory = messages.map((m: MessageWithAuthor) => ({
    from: m.author === player.id ? player.name : otherPlayer.name,
    text: m.text,
    timestamp: m._creationTime || Date.now(),
  }));

  // Use ElizaOS (NO fallback)
  const response = await ctx.runAction(internal.elizaAgent.actions.generateResponse, {
    playerId: playerId,
    conversationHistory,
    lastMessage: {
      from: 'System',
      text: `You need to leave this conversation now. Say goodbye briefly.`,
      timestamp: Date.now(),
    },
  });

  console.log(`[ElizaOS] ${player.name} leaving: "${response}"`);
  return response || "I have to go now. Goodbye!";
}

// =============================================================================
// Query for Prompt Data
// =============================================================================

export const queryPromptData = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId,
    otherPlayerId: playerId,
    conversationId,
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }
    const player = world.players.find((p) => p.id === args.playerId);
    if (!player) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!playerDescription) {
      throw new Error(`Player description for ${args.playerId} not found`);
    }
    const otherPlayer = world.players.find((p) => p.id === args.otherPlayerId);
    if (!otherPlayer) {
      throw new Error(`Player ${args.otherPlayerId} not found`);
    }
    const otherPlayerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.otherPlayerId))
      .first();
    if (!otherPlayerDescription) {
      throw new Error(`Player description for ${args.otherPlayerId} not found`);
    }
    const conversation = world.conversations.find((c) => c.id === args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const agent = world.agents.find((a) => a.playerId === args.playerId);
    if (!agent) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const agentDescription = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', agent.id))
      .first();
    if (!agentDescription) {
      throw new Error(`Agent description for ${agent.id} not found`);
    }
    const otherAgent = world.agents.find((a) => a.playerId === args.otherPlayerId);
    let otherAgentDescription;
    if (otherAgent) {
      otherAgentDescription = await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', otherAgent.id))
        .first();
      if (!otherAgentDescription) {
        throw new Error(`Agent description for ${otherAgent.id} not found`);
      }
    }
    const lastTogether = await ctx.db
      .query('participatedTogether')
      .withIndex('edge', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('player1', args.playerId)
          .eq('player2', args.otherPlayerId),
      )
      .order('desc')
      .first();

    let lastConversation = null;
    if (lastTogether) {
      lastConversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) =>
          q.eq('worldId', args.worldId).eq('id', lastTogether.conversationId),
        )
        .first();
      if (!lastConversation) {
        throw new Error(`Conversation ${lastTogether.conversationId} not found`);
      }
    }

    // Get ElizaOS agent mapping
    const elizaAgent = await ctx.db
      .query('elizaAgents')
      .withIndex('playerId', (q) => q.eq('playerId', args.playerId))
      .first();

    const otherAgentData =
      otherAgent && otherAgentDescription
        ? {
            identity: otherAgentDescription.identity,
            plan: otherAgentDescription.plan,
            ...otherAgent,
          }
        : null;

    return {
      player: { name: playerDescription.name, ...player },
      otherPlayer: { name: otherPlayerDescription.name, ...otherPlayer },
      conversation,
      agent: { identity: agentDescription.identity, plan: agentDescription.plan, ...agent },
      otherAgent: otherAgentData,
      lastConversation,
      elizaAgent,
    };
  },
});
