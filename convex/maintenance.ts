import { ConvexError, v } from 'convex/values';
import { mutation } from './_generated/server';
import { kickEngine } from './aiTown/main';
import { Id } from './_generated/dataModel';
import * as map from '../data/gentle';

export const cleanupWorldData = mutation({
  args: {
    worldId: v.optional(v.id('worlds')),
  },
  handler: async (ctx, args) => {
    let worldId = args.worldId;
    if (!worldId) {
      const worldStatus = await ctx.db
        .query('worldStatus')
        .filter((q) => q.eq(q.field('isDefault'), true))
        .first();
      if (!worldStatus) {
        throw new ConvexError('No default world found.');
      }
      worldId = worldStatus.worldId;
    }
    if (!worldId) {
      throw new ConvexError('No world ID resolved.');
    }

    const resolvedWorldId: Id<'worlds'> = worldId;
    const world = await ctx.db.get(resolvedWorldId);
    if (!world) {
      throw new ConvexError(`Invalid world ID: ${resolvedWorldId}`);
    }

    const playerIds = new Set(world.players.map((player) => player.id));
    const cleanedAgents = world.agents.filter((agent) => playerIds.has(agent.playerId));
    const removedAgentIds = world.agents
      .filter((agent) => !playerIds.has(agent.playerId))
      .map((agent) => agent.id);

    const cleanedConversations = world.conversations.filter((conversation) =>
      conversation.participants.every((member) => playerIds.has(member.playerId)),
    );
    const removedConversationIds = world.conversations
      .filter((conversation) =>
        conversation.participants.some((member) => !playerIds.has(member.playerId)),
      )
      .map((conversation) => conversation.id);

    if (removedAgentIds.length > 0 || removedConversationIds.length > 0) {
      await ctx.db.replace(resolvedWorldId, {
        ...world,
        agents: cleanedAgents,
        conversations: cleanedConversations,
      });
    }

    const agentDescriptions = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', resolvedWorldId))
      .collect();
    const remainingAgentIds = new Set(cleanedAgents.map((agent) => agent.id));
    let removedAgentDescriptions = 0;
    for (const description of agentDescriptions) {
      if (!remainingAgentIds.has(description.agentId)) {
        await ctx.db.delete(description._id);
        removedAgentDescriptions += 1;
      }
    }

    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', resolvedWorldId))
      .collect();
    let removedPlayerDescriptions = 0;
    for (const description of playerDescriptions) {
      if (!playerIds.has(description.playerId)) {
        await ctx.db.delete(description._id);
        removedPlayerDescriptions += 1;
      }
    }

    try {
      await kickEngine(ctx, resolvedWorldId);
    } catch (error) {
      console.warn(`Failed to kick engine for ${resolvedWorldId}:`, error);
    }

    return {
      worldId: resolvedWorldId,
      removedAgentIds,
      removedConversationIds,
      removedAgentDescriptions,
      removedPlayerDescriptions,
    };
  },
});

export const reloadMap = mutation({
  args: {
    worldId: v.optional(v.id('worlds')),
  },
  handler: async (ctx, args) => {
    let worldId = args.worldId as Id<'worlds'> | undefined;
    if (!worldId) {
      const worldStatus = await ctx.db
        .query('worldStatus')
        .filter((q) => q.eq(q.field('isDefault'), true))
        .first();
      if (!worldStatus) {
        throw new ConvexError('No default world found.');
      }
      worldId = worldStatus.worldId;
    }
    if (!worldId) {
      throw new ConvexError('No world found.');
    }
    const resolvedWorldId = worldId;

    const existingMaps = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', resolvedWorldId))
      .collect();

    const worldMap = {
      worldId: resolvedWorldId,
      width: map.mapwidth,
      height: map.mapheight,
      tileSetUrl: map.tilesetpath,
      tileSetDimX: map.tilesetpxw,
      tileSetDimY: map.tilesetpxh,
      tileDim: map.tiledim,
      bgTiles: map.bgtiles,
      objectTiles: map.objmap,
      placedObjects: map.placedobjects ?? [],
      interactables: (map as any).interactables ?? [],
      terrainDecals: map.terraindecals ?? (map as any).terrainDecals,
      animatedSprites: map.animatedsprites ?? [],
    };

    for (const existingMap of existingMaps) {
      await ctx.db.delete(existingMap._id);
    }
    const mapId = await ctx.db.insert('maps', worldMap);

    try {
      await kickEngine(ctx, resolvedWorldId);
    } catch (error) {
      console.warn(`Failed to kick engine for ${resolvedWorldId}:`, error);
    }

    return {
      worldId: resolvedWorldId,
      replaced: existingMaps.length > 0,
      deletedCount: existingMaps.length,
      mapId,
    };
  },
});
