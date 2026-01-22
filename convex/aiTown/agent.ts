/**
 * Agent Server Logic
 * 
 * This file contains server-side agent logic.
 * The Agent class is extended from agentTypes.ts with server-specific methods.
 */

import { v } from 'convex/values';
import { agentId, conversationId, playerId } from './ids';
import { serializedPlayer } from './player';
import { Game } from './game';
import {
  ACTION_TIMEOUT,
  AWKWARD_CONVERSATION_TIMEOUT,
  CONVERSATION_COOLDOWN,
  CONVERSATION_DISTANCE,
  INVITE_ACCEPT_PROBABILITY,
  INVITE_TIMEOUT,
  MAX_CONVERSATION_DURATION,
  MAX_CONVERSATION_MESSAGES,
  MESSAGE_COOLDOWN,
  MIDPOINT_THRESHOLD,
  PLAYER_CONVERSATION_COOLDOWN,
} from '../constants';
import { FunctionArgs } from 'convex/server';
import { MutationCtx, internalMutation, internalQuery } from '../_generated/server';
import { distance } from '../util/geometry';
import { internal } from '../_generated/api';
import { movePlayer } from './movement';
import { insertInput } from './insertInput';

// Re-export types from agentTypes for backward compatibility
export { Agent, serializedAgent, type SerializedAgent } from './agentTypes';
import { Agent } from './agentTypes';
import { 
  stopConversation, 
  acceptConversationInvite, 
  rejectConversationInvite, 
  leaveConversation,
  setConversationIsTyping 
} from './conversation';

// =============================================================================
// Agent Tick Function (called by game loop)
// =============================================================================

export function tickAgent(agent: Agent, game: Game, now: number) {
  const player = game.world.players.get(agent.playerId);
  if (!player) {
    console.warn(`Agent ${agent.id} missing player ${agent.playerId}, removing agent.`);
    for (const conversation of [...game.world.conversations.values()]) {
      if (conversation.participants.has(agent.playerId)) {
        stopConversation(conversation, game, now);
      }
    }
    game.world.agents.delete(agent.id);
    game.agentDescriptions.delete(agent.id);
    game.playerDescriptions.delete(agent.playerId);
    game.descriptionsModified = true;
    return;
  }
  if (player.human) {
    return;
  }
  if (agent.inProgressOperation) {
    if (now < agent.inProgressOperation.started + ACTION_TIMEOUT) {
      return;
    }
    console.log(`Timing out ${JSON.stringify(agent.inProgressOperation)}`);
    delete agent.inProgressOperation;
  }
  const conversation = game.world.playerConversation(player);
  const member = conversation?.participants.get(player.id);

  const recentlyAttemptedInvite =
    agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;
  const doingActivity = player.activity && player.activity.until > now;
  if (doingActivity && (conversation || player.pathfinding)) {
    player.activity!.until = now;
  }
  if (!conversation && !doingActivity && (!player.pathfinding || !recentlyAttemptedInvite)) {
    startAgentOperation(agent, game, now, 'agentDoSomething', {
      worldId: game.worldId,
      player: player.serialize(),
      otherFreePlayers: [...game.world.players.values()]
        .filter((p) => p.id !== player.id)
        .filter(
          (p) => ![...game.world.conversations.values()].find((c) => c.participants.has(p.id)),
        )
        .map((p) => p.serialize()),
      agent: agent.serialize(),
      map: game.worldMap.serialize(),
    });
    return;
  }
  if (agent.toRemember) {
    console.log(`Agent ${agent.id} remembering conversation ${agent.toRemember}`);
    startAgentOperation(agent, game, now, 'agentRememberConversation', {
      worldId: game.worldId,
      playerId: agent.playerId,
      agentId: agent.id,
      conversationId: agent.toRemember,
    });
    delete agent.toRemember;
    return;
  }
  if (conversation && member) {
    const [otherPlayerId] = [...conversation.participants.entries()].find(
      ([id]) => id !== player.id,
    )!;
    const otherPlayer = game.world.players.get(otherPlayerId)!;
    if (member.status.kind === 'invited') {
      if (otherPlayer.human || Math.random() < INVITE_ACCEPT_PROBABILITY) {
        console.log(`Agent ${player.id} accepting invite from ${otherPlayer.id}`);
        acceptConversationInvite(conversation, game, player);
        if (player.pathfinding) {
          delete player.pathfinding;
        }
      } else {
        console.log(`Agent ${player.id} rejecting invite from ${otherPlayer.id}`);
        rejectConversationInvite(conversation, game, now, player);
      }
      return;
    }
    if (member.status.kind === 'walkingOver') {
      if (member.invited + INVITE_TIMEOUT < now) {
        console.log(`Giving up on invite to ${otherPlayer.id}`);
        leaveConversation(conversation, game, now, player);
        return;
      }
      const playerDistance = distance(player.position, otherPlayer.position);
      if (playerDistance < CONVERSATION_DISTANCE) {
        return;
      }
      if (!player.pathfinding) {
        let destination;
        if (playerDistance < MIDPOINT_THRESHOLD) {
          destination = {
            x: Math.floor(otherPlayer.position.x),
            y: Math.floor(otherPlayer.position.y),
          };
        } else {
          destination = {
            x: Math.floor((player.position.x + otherPlayer.position.x) / 2),
            y: Math.floor((player.position.y + otherPlayer.position.y) / 2),
          };
        }
        console.log(`Agent ${player.id} walking towards ${otherPlayer.id}...`, destination);
        movePlayer(game, now, player, destination);
      }
      return;
    }
    if (member.status.kind === 'participating') {
      const started = member.status.started;
      if (conversation.isTyping && conversation.isTyping.playerId !== player.id) {
        return;
      }
      if (!conversation.lastMessage) {
        const isInitiator = conversation.creator === player.id;
        const awkwardDeadline = started + AWKWARD_CONVERSATION_TIMEOUT;
        if (isInitiator || awkwardDeadline < now) {
          console.log(`${player.id} initiating conversation with ${otherPlayer.id}.`);
          const messageUuid = crypto.randomUUID();
          setConversationIsTyping(conversation, now, player, messageUuid);
          startAgentOperation(agent, game, now, 'agentGenerateMessage', {
            worldId: game.worldId,
            playerId: player.id,
            agentId: agent.id,
            conversationId: conversation.id,
            otherPlayerId: otherPlayer.id,
            messageUuid,
            type: 'start',
          });
          return;
        } else {
          return;
        }
      }
      const tooLongDeadline = started + MAX_CONVERSATION_DURATION;
      if (tooLongDeadline < now || conversation.numMessages > MAX_CONVERSATION_MESSAGES) {
        console.log(`${player.id} leaving conversation with ${otherPlayer.id}.`);
        const messageUuid = crypto.randomUUID();
        setConversationIsTyping(conversation, now, player, messageUuid);
        startAgentOperation(agent, game, now, 'agentGenerateMessage', {
          worldId: game.worldId,
          playerId: player.id,
          agentId: agent.id,
          conversationId: conversation.id,
          otherPlayerId: otherPlayer.id,
          messageUuid,
          type: 'leave',
        });
        return;
      }
      if (conversation.lastMessage.author === player.id) {
        const awkwardDeadline = conversation.lastMessage.timestamp + AWKWARD_CONVERSATION_TIMEOUT;
        if (now < awkwardDeadline) {
          return;
        }
      }
      const messageCooldown = conversation.lastMessage.timestamp + MESSAGE_COOLDOWN;
      if (now < messageCooldown) {
        return;
      }
      console.log(`${player.id} continuing conversation with ${otherPlayer.id}.`);
      const messageUuid = crypto.randomUUID();
      setConversationIsTyping(conversation, now, player, messageUuid);
      startAgentOperation(agent, game, now, 'agentGenerateMessage', {
        worldId: game.worldId,
        playerId: player.id,
        agentId: agent.id,
        conversationId: conversation.id,
        otherPlayerId: otherPlayer.id,
        messageUuid,
        type: 'continue',
      });
      return;
    }
  }
}

function startAgentOperation<Name extends keyof AgentOperations>(
  agent: Agent,
  game: Game,
  now: number,
  name: Name,
  args: Omit<FunctionArgs<AgentOperations[Name]>, 'operationId'>,
) {
  if (agent.inProgressOperation) {
    throw new Error(
      `Agent ${agent.id} already has an operation: ${JSON.stringify(agent.inProgressOperation)}`,
    );
  }
  const operationId = game.allocId('operations');
  const nameStr = String(name);
  console.log(`Agent ${agent.id} starting operation ${nameStr} (${operationId})`);
  game.scheduleOperation(nameStr, { operationId, ...args });
  agent.inProgressOperation = {
    name: nameStr,
    operationId,
    started: now,
  };
}

type AgentOperations = typeof internal.aiTown.agentOperations;

// =============================================================================
// Server Functions
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runAgentOperation(ctx: MutationCtx, operation: string, args: any) {
  let reference;
  switch (operation) {
    case 'agentRememberConversation':
      reference = internal.aiTown.agentOperations.agentRememberConversation;
      break;
    case 'agentGenerateMessage':
      reference = internal.aiTown.agentOperations.agentGenerateMessage;
      break;
    case 'agentDoSomething':
      reference = internal.aiTown.agentOperations.agentDoSomething;
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  await ctx.scheduler.runAfter(0, reference, args);
}

export const agentSendMessage = internalMutation({
  args: {
    worldId: v.id('worlds'),
    conversationId,
    agentId,
    playerId,
    text: v.string(),
    messageUuid: v.string(),
    leaveConversation: v.boolean(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: args.playerId,
      text: args.text,
      messageUuid: args.messageUuid,
      worldId: args.worldId,
    });
    await insertInput(ctx, args.worldId, 'agentFinishSendingMessage', {
      conversationId: args.conversationId,
      agentId: args.agentId,
      timestamp: Date.now(),
      leaveConversation: args.leaveConversation,
      operationId: args.operationId,
    });
  },
});

export const findConversationCandidate = internalQuery({
  args: {
    now: v.number(),
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
  },
  handler: async (ctx, { now, worldId, player, otherFreePlayers }) => {
    const { position } = player;
    const candidates = [];

    for (const otherPlayer of otherFreePlayers) {
      const lastMember = await ctx.db
        .query('participatedTogether')
        .withIndex('edge', (q) =>
          q.eq('worldId', worldId).eq('player1', player.id).eq('player2', otherPlayer.id),
        )
        .order('desc')
        .first();
      if (lastMember) {
        if (now < lastMember.ended + PLAYER_CONVERSATION_COOLDOWN) {
          continue;
        }
      }
      candidates.push({ id: otherPlayer.id, position });
    }

    candidates.sort((a, b) => distance(a.position, position) - distance(b.position, position));
    return candidates[0]?.id;
  },
});
