/**
 * Conversation Server Logic
 * 
 * This file contains server-side conversation logic.
 * The Conversation class is in conversationTypes.ts for frontend use.
 */

import { v } from 'convex/values';
import { GameId, parseGameId } from './ids';
import { conversationId, playerId } from './ids';
import { Player } from './player';
import { inputHandler } from './inputHandler';

import { TYPING_TIMEOUT, CONVERSATION_DISTANCE } from '../constants';
import { distance, normalize, vector } from '../util/geometry';
import { Point } from '../util/types';
import { Game } from './game';
import { stopPlayer, blocked, movePlayer } from './movement';

// Re-export types from conversationTypes for backward compatibility
export { Conversation, serializedConversation, type SerializedConversation } from './conversationTypes';
import { Conversation } from './conversationTypes';

// =============================================================================
// Conversation Server Functions
// =============================================================================

export function tickConversation(conversation: Conversation, game: Game, now: number) {
  if (conversation.isTyping && conversation.isTyping.since + TYPING_TIMEOUT < now) {
    delete conversation.isTyping;
  }
  if (conversation.participants.size !== 2) {
    console.warn(`Conversation ${conversation.id} has ${conversation.participants.size} participants`);
    return;
  }
  const [playerId1, playerId2] = [...conversation.participants.keys()];
  const member1 = conversation.participants.get(playerId1)!;
  const member2 = conversation.participants.get(playerId2)!;

  const player1 = game.world.players.get(playerId1)!;
  const player2 = game.world.players.get(playerId2)!;

  const playerDistance = distance(player1?.position, player2?.position);

  // If the players are both in the "walkingOver" state and they're sufficiently close, transition both
  // of them to "participating" and stop their paths.
  if (member1.status.kind === 'walkingOver' && member2.status.kind === 'walkingOver') {
    if (playerDistance < CONVERSATION_DISTANCE) {
      console.log(`Starting conversation between ${player1.id} and ${player2.id}`);

      // First, stop the two players from moving.
      stopPlayer(player1);
      stopPlayer(player2);

      member1.status = { kind: 'participating', started: now };
      member2.status = { kind: 'participating', started: now };

      // Try to move the first player to grid point nearest the other player.
      const neighbors = (p: Point) => [
        { x: p.x + 1, y: p.y },
        { x: p.x - 1, y: p.y },
        { x: p.x, y: p.y + 1 },
        { x: p.x, y: p.y - 1 },
      ];
      const floorPos1 = { x: Math.floor(player1.position.x), y: Math.floor(player1.position.y) };
      const p1Candidates = neighbors(floorPos1).filter((p) => !blocked(game, now, p, player1.id));
      p1Candidates.sort((a, b) => distance(a, player2.position) - distance(b, player2.position));
      if (p1Candidates.length > 0) {
        const p1Candidate = p1Candidates[0];

        // Try to move the second player to the grid point nearest the first player's
        // destination.
        const p2Candidates = neighbors(p1Candidate).filter(
          (p) => !blocked(game, now, p, player2.id),
        );
        p2Candidates.sort(
          (a, b) => distance(a, player2.position) - distance(b, player2.position),
        );
        if (p2Candidates.length > 0) {
          const p2Candidate = p2Candidates[0];
          movePlayer(game, now, player1, p1Candidate, true);
          movePlayer(game, now, player2, p2Candidate, true);
        }
      }
    }
  }

  // Orient the two players towards each other if they're not moving.
  if (member1.status.kind === 'participating' && member2.status.kind === 'participating') {
    const v = normalize(vector(player1.position, player2.position));
    if (!player1.pathfinding && v) {
      player1.facing = v;
    }
    if (!player2.pathfinding && v) {
      player2.facing.dx = -v.dx;
      player2.facing.dy = -v.dy;
    }
  }
}

export function startConversation(game: Game, now: number, player: Player, invitee: Player) {
  if (player.id === invitee.id) {
    throw new Error(`Can't invite yourself to a conversation`);
  }
  // Ensure the players still exist.
  if ([...game.world.conversations.values()].find((c) => c.participants.has(player.id))) {
    const reason = `Player ${player.id} is already in a conversation`;
    console.log(reason);
    return { error: reason };
  }
  if ([...game.world.conversations.values()].find((c) => c.participants.has(invitee.id))) {
    const reason = `Player ${player.id} is already in a conversation`;
    console.log(reason);
    return { error: reason };
  }
  const newConversationId = game.allocId('conversations');
  console.log(`Creating conversation ${newConversationId}`);
  game.world.conversations.set(
    newConversationId,
    new Conversation({
      id: newConversationId,
      created: now,
      creator: player.id,
      numMessages: 0,
      participants: [
        { playerId: player.id, invited: now, status: { kind: 'walkingOver' } },
        { playerId: invitee.id, invited: now, status: { kind: 'invited' } },
      ],
    }),
  );
  return { conversationId: newConversationId };
}

export function setConversationIsTyping(conversation: Conversation, now: number, player: Player, messageUuid: string) {
  if (conversation.isTyping) {
    if (conversation.isTyping.playerId !== player.id) {
      throw new Error(`Player ${conversation.isTyping.playerId} is already typing in ${conversation.id}`);
    }
    return;
  }
  conversation.isTyping = { playerId: player.id, messageUuid, since: now };
}

export function acceptConversationInvite(conversation: Conversation, _game: Game, player: Player) {
  const member = conversation.participants.get(player.id);
  if (!member) {
    throw new Error(`Player ${player.id} not in conversation ${conversation.id}`);
  }
  if (member.status.kind !== 'invited') {
    throw new Error(
      `Invalid membership status for ${player.id}:${conversation.id}: ${JSON.stringify(member)}`,
    );
  }
  member.status = { kind: 'walkingOver' };
}

export function rejectConversationInvite(conversation: Conversation, game: Game, now: number, player: Player) {
  const member = conversation.participants.get(player.id);
  if (!member) {
    throw new Error(`Player ${player.id} not in conversation ${conversation.id}`);
  }
  if (member.status.kind !== 'invited') {
    throw new Error(
      `Rejecting invite in wrong membership state: ${conversation.id}:${player.id}: ${JSON.stringify(
        member,
      )}`,
    );
  }
  stopConversation(conversation, game, now);
}

export function stopConversation(conversation: Conversation, game: Game, now: number) {
  delete conversation.isTyping;
  for (const [pId] of conversation.participants.entries()) {
    const agent = [...game.world.agents.values()].find((a) => a.playerId === pId);
    if (agent) {
      agent.lastConversation = now;
      agent.toRemember = conversation.id;
    }
  }
  game.world.conversations.delete(conversation.id);
}

export function leaveConversation(conversation: Conversation, game: Game, now: number, player: Player) {
  const member = conversation.participants.get(player.id);
  if (!member) {
    throw new Error(`Couldn't find membership for ${conversation.id}:${player.id}`);
  }
  stopConversation(conversation, game, now);
}

// =============================================================================
// Input Handlers
// =============================================================================

export const conversationInputs = {
  startConversation: inputHandler({
    args: {
      playerId,
      invitee: playerId,
    },
    handler: (game: Game, now: number, args): GameId<'conversations'> => {
      const pId = parseGameId('players', args.playerId);
      const player = game.world.players.get(pId);
      if (!player) {
        throw new Error(`Invalid player ID: ${pId}`);
      }
      const inviteeId = parseGameId('players', args.invitee);
      const invitee = game.world.players.get(inviteeId);
      if (!invitee) {
        throw new Error(`Invalid player ID: ${inviteeId}`);
      }
      console.log(`Starting ${pId} ${inviteeId}...`);
      const { conversationId: cId, error } = startConversation(game, now, player, invitee);
      if (!cId) {
        throw new Error(error);
      }
      return cId;
    },
  }),

  startTyping: inputHandler({
    args: {
      playerId,
      conversationId,
      messageUuid: v.string(),
    },
    handler: (game: Game, now: number, args): null => {
      const pId = parseGameId('players', args.playerId);
      const player = game.world.players.get(pId);
      if (!player) {
        throw new Error(`Invalid player ID: ${pId}`);
      }
      const cId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(cId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID: ${cId}`);
      }
      if (conversation.isTyping && conversation.isTyping.playerId !== pId) {
        throw new Error(
          `Player ${conversation.isTyping.playerId} is already typing in ${cId}`,
        );
      }
      conversation.isTyping = { playerId: pId, messageUuid: args.messageUuid, since: now };
      return null;
    },
  }),

  finishSendingMessage: inputHandler({
    args: {
      playerId,
      conversationId,
      timestamp: v.number(),
    },
    handler: (game: Game, now: number, args): null => {
      const pId = parseGameId('players', args.playerId);
      const cId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(cId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID: ${cId}`);
      }
      if (conversation.isTyping && conversation.isTyping.playerId === pId) {
        delete conversation.isTyping;
      }
      conversation.lastMessage = { author: pId, timestamp: args.timestamp };
      conversation.numMessages++;
      return null;
    },
  }),

  acceptInvite: inputHandler({
    args: {
      playerId,
      conversationId,
    },
    handler: (game: Game, now: number, args): null => {
      const pId = parseGameId('players', args.playerId);
      const player = game.world.players.get(pId);
      if (!player) {
        throw new Error(`Invalid player ID ${pId}`);
      }
      const cId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(cId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID ${cId}`);
      }
      acceptConversationInvite(conversation, game, player);
      return null;
    },
  }),

  rejectInvite: inputHandler({
    args: {
      playerId,
      conversationId,
    },
    handler: (game: Game, now: number, args): null => {
      const pId = parseGameId('players', args.playerId);
      const player = game.world.players.get(pId);
      if (!player) {
        throw new Error(`Invalid player ID ${pId}`);
      }
      const cId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(cId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID ${cId}`);
      }
      rejectConversationInvite(conversation, game, now, player);
      return null;
    },
  }),

  leaveConversation: inputHandler({
    args: {
      playerId,
      conversationId,
    },
    handler: (game: Game, now: number, args): null => {
      const pId = parseGameId('players', args.playerId);
      const player = game.world.players.get(pId);
      if (!player) {
        throw new Error(`Invalid player ID ${pId}`);
      }
      const cId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(cId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID ${cId}`);
      }
      leaveConversation(conversation, game, now, player);
      return null;
    },
  }),
};
