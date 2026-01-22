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
import type { TownAction } from '../elizaAgent/elizaRuntime';

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
// Agent Decide On Invite - ELIZA OS POWERED
// =============================================================================

export const agentDecideOnInvite = internalAction({
  args: {
    worldId: v.id('worlds'),
    agentId,
    playerId,
    conversationId,
    inviterPlayerId: playerId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Get player names
      const playerNames = await ctx.runQuery(internal.aiTown.agentOperations.getAgentPlayerNames, {
        worldId: args.worldId,
        playerIds: [args.playerId, args.inviterPlayerId],
      });
      
      // Get agent description for character info
      const agentDescription = await ctx.runQuery(internal.aiTown.agentOperations.getAgentDescription, {
        worldId: args.worldId,
        agentId: args.agentId,
      });

      // Ask ElizaOS whether to accept the invite
      const decision = await ctx.runAction(internal.elizaAgent.elizaRuntime.decideOnInvite, {
        agentId: args.agentId,
        characterName: playerNames[args.playerId] || 'Agent',
        characterBio: agentDescription?.identity || 'A friendly character in AI Town',
        characterPersonality: agentDescription?.personality || ['friendly', 'curious'],
        inviterName: playerNames[args.inviterPlayerId] || 'Someone',
        inviterActivity: undefined,
        currentActivity: undefined,
        recentInteractionWithInviter: false,
      });

      console.log(`[ElizaOS] Agent ${args.agentId} ${decision.accept ? 'accepts' : 'rejects'} invite: ${decision.reason}`);

      await sleep(Math.random() * 500);
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'finishDecideOnInvite',
        args: {
          operationId: args.operationId,
          agentId: args.agentId,
          conversationId: args.conversationId,
          accept: decision.accept,
        },
      });
    } catch (error) {
      console.error(`[ElizaOS] Invite decision error for agent ${args.agentId}:`, error);
      // Default to accepting on error
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'finishDecideOnInvite',
        args: {
          operationId: args.operationId,
          agentId: args.agentId,
          conversationId: args.conversationId,
          accept: true,
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

    // Get player names for nearby agents
    const playerNames = await ctx.runQuery(internal.aiTown.agentOperations.getAgentPlayerNames, {
      worldId: args.worldId,
      playerIds: [player.id, ...otherFreePlayers.map(p => p.id)],
    });
    
    // Get agent description for character info
    const agentDescription = await ctx.runQuery(internal.aiTown.agentOperations.getAgentDescription, {
      worldId: args.worldId,
      agentId: agent.id,
    });

    // Build context for ElizaOS with resolved names
    const nearbyAgents = otherFreePlayers.map((p) => ({
      id: p.id,
      name: playerNames[p.id] || p.id,
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
      // Ask ElizaOS runtime what action to take
      const action: TownAction = await ctx.runAction(internal.elizaAgent.elizaRuntime.makeAgentDecision, {
        agentId: agent.id,
        playerId: player.id,
        worldId: args.worldId,
        characterName: playerNames[player.id] || 'Agent',
        characterBio: agentDescription?.identity || 'A friendly character in AI Town',
        characterPersonality: agentDescription?.personality || ['friendly', 'curious'],
        position: { x: player.position.x, y: player.position.y },
        nearbyAgents,
        recentMessages: recentMessages.map((m: { from: string; text: string }) => ({ from: m.from, text: m.text })),
        currentActivity: player.activity?.description,
        inConversation: false,
        conversationMessages: undefined,
      });

      console.log(`[ElizaOS] Agent ${agent.id} action:`, action.type, action.params);

      // Process the action
      await sleep(Math.random() * 1000);
      const params = action.params as Record<string, unknown>;

      switch (action.type) {
        case 'MOVE': {
          // ElizaOS action: MOVE to specific location
          // If ElizaOS didn't provide coordinates, treat as WANDER (ask ElizaOS where to go)
          if (typeof params.x !== 'number' || typeof params.y !== 'number') {
            console.log(`[ElizaOS] MOVE without coordinates, treating as WANDER`);
            const wanderResult = await ctx.runAction(internal.elizaAgent.elizaRuntime.chooseWanderDestination, {
              agentId: agent.id,
              characterName: playerNames[player.id] || 'Agent',
              characterBio: agentDescription?.identity || 'A friendly character',
              characterPersonality: agentDescription?.personality || ['friendly', 'curious'],
              currentPosition: { x: player.position.x, y: player.position.y },
              mapWidth: map.width,
              mapHeight: map.height,
              nearbyAgents: nearbyAgents.slice(0, 5).map(a => ({
                name: a.name,
                position: a.position,
                distance: a.distance,
              })),
            });
            await ctx.runMutation(api.aiTown.main.sendInput, {
              worldId: args.worldId,
              name: 'finishDoSomething',
              args: {
                operationId: args.operationId,
                agentId: agent.id,
                destination: { x: wanderResult.x, y: wanderResult.y },
              },
            });
          } else {
            await ctx.runMutation(api.aiTown.main.sendInput, {
              worldId: args.worldId,
              name: 'finishDoSomething',
              args: {
                operationId: args.operationId,
                agentId: agent.id,
                destination: {
                  x: Math.max(1, Math.min(map.width - 2, Math.round(params.x))),
                  y: Math.max(1, Math.min(map.height - 2, Math.round(params.y))),
                },
              },
            });
          }
          break;
        }

        case 'ACTIVITY': {
          // ElizaOS action: ACTIVITY in place
          // Ensure we have a valid description from ElizaOS, not hardcoded
          const description = params.description ? String(params.description) : action.reason || 'Being thoughtful';
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              activity: {
                description,
                emoji: String(params.emoji || '💭'),
                until: Date.now() + (Number(params.duration) || 30) * 1000,
              },
            },
          });
          break;
        }

        case 'CONVERSE': {
          // ElizaOS action: CONVERSE with nearby character
          if (justLeftConversation || recentlyAttemptedInvite) {
            // On cooldown - do a brief idle activity instead
            // Use ElizaOS's reason for wanting to converse as context
            const cooldownReason = action.reason 
              ? `Considering: ${action.reason}` 
              : 'Reflecting on recent conversation';
            await ctx.runMutation(api.aiTown.main.sendInput, {
              worldId: args.worldId,
              name: 'finishDoSomething',
              args: {
                operationId: args.operationId,
                agentId: agent.id,
                activity: {
                  description: cooldownReason,
                  emoji: '💭',
                  until: Date.now() + 10000, // Wait 10 seconds
                },
              },
            });
          } else {
            // Find the target player by name
            const targetName = String(params.target || '').toLowerCase();
            const targetPlayer = otherFreePlayers.find((p) => 
              (playerNames[p.id] || '').toLowerCase() === targetName
            );
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

        case 'WANDER': {
          // ElizaOS action: WANDER with intelligent destination selection
          const wanderResult = await ctx.runAction(internal.elizaAgent.elizaRuntime.chooseWanderDestination, {
            agentId: agent.id,
            characterName: playerNames[player.id] || 'Agent',
            characterBio: agentDescription?.identity || 'A friendly character',
            characterPersonality: agentDescription?.personality || ['friendly', 'curious'],
            currentPosition: { x: player.position.x, y: player.position.y },
            mapWidth: map.width,
            mapHeight: map.height,
            nearbyAgents: nearbyAgents.slice(0, 5).map(a => ({
              name: a.name,
              position: a.position,
              distance: a.distance,
            })),
          });
          
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              destination: { x: wanderResult.x, y: wanderResult.y },
            },
          });
          break;
        }

        case 'IDLE':
        default: {
          // ElizaOS action: IDLE - stay in place with a brief activity
          // Use the reason from ElizaOS as the activity description
          const idleReason = action.reason || 'Taking a moment';
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              activity: {
                description: idleReason,
                emoji: '💭',
                until: Date.now() + 10000, // 10 seconds of idle
              },
            },
          });
          break;
        }
      }
    } catch (error) {
      // Error fallback - still try to be character-appropriate
      // Log the error but use character name in the activity
      const charName = playerNames[player.id] || 'Agent';
      console.error(`[ElizaOS] Decision error for agent ${agent.id} (${charName}):`, error);
      await sleep(Math.random() * 1000);
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'finishDoSomething',
        args: {
          operationId: args.operationId,
          agentId: agent.id,
          activity: {
            description: `Lost in thought`,
            emoji: '🤔',
            until: Date.now() + 5000,
          },
        },
      });
    }
  },
});

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

export const getAgentDescription = internalQuery({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    const agentDesc = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', args.agentId))
      .first();
    
    if (!agentDesc) return null;
    
    // Get ElizaOS agent config if exists
    const world = await ctx.db.get(args.worldId);
    const agent = world?.agents.find(a => a.id === args.agentId);
    
    if (agent) {
      const elizaAgent = await ctx.db
        .query('elizaAgents')
        .withIndex('playerId', (q) => q.eq('playerId', agent.playerId))
        .first();
      
      if (elizaAgent) {
        return {
          identity: elizaAgent.bio,
          plan: agentDesc.plan,
          personality: elizaAgent.personality,
        };
      }
    }
    
    return {
      identity: agentDesc.identity,
      plan: agentDesc.plan,
      personality: ['friendly', 'curious'], // Default personality
    };
  },
});
