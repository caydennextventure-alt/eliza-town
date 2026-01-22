/**
 * Agent Operations - ElizaOS-Powered
 * 
 * This module handles all agent autonomous behavior using ElizaOS.
 * Every decision (movement, activities, conversations) is made by ElizaOS.
 * NO random behavior - all choices are character-driven and context-aware.
 */

import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { WorldMap, serializedWorldMap } from './worldMap';
import { rememberConversation } from '../agent/memory';
import { GameId, agentId, conversationId, playerId } from './ids';
import {
  continueConversationMessage,
  leaveConversationMessage,
  startConversationMessage,
} from '../agent/conversation';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from './agent';
import { CONVERSATION_COOLDOWN } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';
import type { AgentDecision } from '../elizaAgent/actions';

// =============================================================================
// Remember Conversation (unchanged - uses existing memory system)
// =============================================================================

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      await rememberConversation(
        ctx,
        args.worldId,
        args.agentId as GameId<'agents'>,
        args.playerId as GameId<'players'>,
        args.conversationId as GameId<'conversations'>,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`agentRememberConversation failed: ${message}`);
    } finally {
      await sleep(Math.random() * 1000);
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'finishRememberConversation',
        args: {
          agentId: args.agentId,
          operationId: args.operationId,
        },
      });
    }
  },
});

// =============================================================================
// Generate Message (uses ElizaOS for chat)
// =============================================================================

export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    let completionFn;
    switch (args.type) {
      case 'start':
        completionFn = startConversationMessage;
        break;
      case 'continue':
        completionFn = continueConversationMessage;
        break;
      case 'leave':
        completionFn = leaveConversationMessage;
        break;
      default:
        assertNever(args.type);
    }
    try {
      const text = await completionFn(
        ctx,
        args.worldId,
        args.conversationId as GameId<'conversations'>,
        args.playerId as GameId<'players'>,
        args.otherPlayerId as GameId<'players'>,
      );
      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
        worldId: args.worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text,
        messageUuid: args.messageUuid,
        leaveConversation: args.type === 'leave',
        operationId: args.operationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`agentGenerateMessage failed: ${message}`);
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'agentAbortConversation',
        args: {
          agentId: args.agentId,
          conversationId: args.conversationId,
          operationId: args.operationId,
          leaveConversation: true,
        },
      });
    }
  },
});

// =============================================================================
// Agent Do Something - ELIZA OS POWERED
// =============================================================================

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { player, agent, otherFreePlayers } = args;
    const map = new WorldMap(args.map);
    const now = Date.now();

    // Cooldown checks
    const justLeftConversation =
      agent.lastConversation && now < agent.lastConversation + CONVERSATION_COOLDOWN;
    const recentlyAttemptedInvite =
      agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;

    // Build context for ElizaOS
    const nearbyAgents = otherFreePlayers.map((p) => ({
      id: p.id,
      name: p.id, // Will be resolved to actual name by the query
      position: { x: p.position.x, y: p.position.y },
      distance: Math.sqrt(
        Math.pow(p.position.x - player.position.x, 2) +
        Math.pow(p.position.y - player.position.y, 2)
      ),
      activity: p.activity?.description,
      isInConversation: false, // These are free players, so not in conversation
    }));

    // Get recent world activity (messages)
    const recentMessages = await ctx.runQuery(internal.aiTown.agentOperations.getRecentWorldMessages, {
      worldId: args.worldId,
      limit: 10,
    });

    try {
      // Ask ElizaOS what to do
      const decision: AgentDecision = await ctx.runAction(internal.elizaAgent.actions.askWhatToDo, {
        agentId: agent.id,
        playerId: player.id,
        worldId: args.worldId,
        position: { x: player.position.x, y: player.position.y },
        nearbyAgents,
        recentMessages,
        currentActivity: player.activity?.description,
        inConversation: false,
        conversationId: undefined,
        conversationParticipants: undefined,
        conversationMessages: undefined,
      });

      console.log(`[ElizaOS] Agent ${agent.id} decision:`, decision.type);

      // Process the decision
      await sleep(Math.random() * 1000);

      switch (decision.type) {
        case 'move': {
          // ElizaOS chose a specific destination
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              destination: {
                x: Math.max(1, Math.min(map.width - 2, Math.round(decision.x))),
                y: Math.max(1, Math.min(map.height - 2, Math.round(decision.y))),
              },
            },
          });
          break;
        }

        case 'activity': {
          // ElizaOS chose an activity
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              activity: {
                description: decision.description,
                emoji: decision.emoji,
                until: Date.now() + decision.duration * 1000,
              },
            },
          });
          break;
        }

        case 'converse': {
          // ElizaOS wants to start a conversation
          if (justLeftConversation || recentlyAttemptedInvite) {
            // On cooldown, just wander instead
            await ctx.runMutation(api.aiTown.main.sendInput, {
              worldId: args.worldId,
              name: 'finishDoSomething',
              args: {
                operationId: args.operationId,
                agentId: agent.id,
                destination: wanderDestination(map),
              },
            });
          } else {
            // Find the target player
            const targetPlayer = otherFreePlayers.find((p) => p.id === decision.targetId);
            await ctx.runMutation(api.aiTown.main.sendInput, {
              worldId: args.worldId,
              name: 'finishDoSomething',
              args: {
                operationId: args.operationId,
                agentId: agent.id,
                invitee: targetPlayer?.id,
              },
            });
          }
          break;
        }

        case 'wander': {
          // ElizaOS chose to wander
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              destination: wanderDestination(map),
            },
          });
          break;
        }

        case 'idle':
        default: {
          // ElizaOS chose to stay idle - wander slowly
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              destination: wanderDestination(map),
            },
          });
          break;
        }
      }
    } catch (error) {
      // Fallback on error - just wander
      console.error(`[ElizaOS] Decision error for agent ${agent.id}:`, error);
      await sleep(Math.random() * 1000);
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'finishDoSomething',
        args: {
          operationId: args.operationId,
          agentId: agent.id,
          destination: wanderDestination(map),
        },
      });
    }
  },
});

// =============================================================================
// Helper Functions
// =============================================================================

function wanderDestination(worldMap: WorldMap) {
  // Wander somewhere at least one tile away from the edge.
  return {
    x: 1 + Math.floor(Math.random() * (worldMap.width - 2)),
    y: 1 + Math.floor(Math.random() * (worldMap.height - 2)),
  };
}

// =============================================================================
// Internal Queries for Context
// =============================================================================

import { internalQuery } from '../_generated/server';

export const getRecentWorldMessages = internalQuery({
  args: {
    worldId: v.id('worlds'),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    // Get recent messages from the world
    const messages = await ctx.db
      .query('messages')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .order('desc')
      .take(args.limit);

    // Get player names for the messages
    const world = await ctx.db.get(args.worldId);
    const playerNames = new Map<string, string>();

    if (world) {
      for (const player of world.players) {
        const desc = await ctx.db
          .query('playerDescriptions')
          .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', player.id))
          .first();
        if (desc) {
          playerNames.set(player.id, desc.name);
        }
      }
    }

    return messages.reverse().map((m) => ({
      from: playerNames.get(m.author) || m.author,
      text: m.text,
      timestamp: m._creationTime,
    }));
  },
});

export const getAgentPlayerNames = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const names: Record<string, string> = {};

    for (const playerId of args.playerIds) {
      const desc = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', playerId))
        .first();
      if (desc) {
        names[playerId] = desc.name;
      }
    }

    return names;
  },
});
