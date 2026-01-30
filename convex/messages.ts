import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { insertInput } from './aiTown/insertInput';
import { conversationId } from './aiTown/ids';
import { requireUserId } from './util/auth';

export const listMessages = query({
  args: {
    worldId: v.id('worlds'),
    conversationId,
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', args.worldId).eq('conversationId', args.conversationId))
      .collect();
    const out = [];
    for (const message of messages) {
      const playerDescription = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', message.author))
        .first();
      const authorName = playerDescription?.name ?? 'Unknown';
      out.push({ ...message, authorName });
    }
    return out;
  },
});

export const writeMessage = mutation({
  args: {
    worldId: v.id('worlds'),
    conversationId,
    messageUuid: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx, 'Not logged in');
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new ConvexError(`Invalid world ID: ${args.worldId}`);
    }
    const player = world.players.find((p) => p.human === userId);
    if (!player) {
      throw new ConvexError('You are not controlling an agent.');
    }
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: player.id,
      messageUuid: args.messageUuid,
      text: args.text,
      worldId: args.worldId,
    });
    await insertInput(ctx, args.worldId, 'finishSendingMessage', {
      conversationId: args.conversationId,
      playerId: player.id,
      timestamp: Date.now(),
    });
  },
});
