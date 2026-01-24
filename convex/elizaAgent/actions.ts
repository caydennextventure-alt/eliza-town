import { action, internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { api } from '../_generated/api';
import { Id } from '../_generated/dataModel';
import { requireUserId } from '../util/auth';

const ELIZA_SERVER = process.env.ELIZA_SERVER_URL || 'https://fliza-agent-production.up.railway.app';

export const createElizaAgent = action({
  args: {
    worldId: v.id('worlds'),
    name: v.string(),
    character: v.string(),
    identity: v.string(), // Maps to bio
    plan: v.string(),
    personality: v.array(v.string()), // ['Friendly', 'Curious']
  },
  handler: async (ctx, args): Promise<{ inputId: Id<"inputs"> | string; elizaAgentId: string }> => {
    const actorId = await requireUserId(ctx, 'Please log in to create an agent.');
    await ctx.runMutation(internal.rateLimit.consume, {
      key: `elizaAgent.createElizaAgent:${actorId}`,
      limit: 5,
      windowMs: 60 * 60_000,
    });
    await ctx.runMutation(internal.audit.log, {
      actorId,
      action: 'elizaAgent.createElizaAgent',
      worldId: args.worldId,
      metadata: {
        hasPersonality: args.personality.length > 0,
        identityLength: args.identity.length,
        planLength: args.plan.length,
      },
    });

    // 1. Create in ElizaOS
    console.log(`Creating Eliza Agent [${args.name}] at ${ELIZA_SERVER}...`);
    
    try {
      // Create character JSON object (minimal required fields)
      const characterConfig = {
          name: args.name,
          bio: [args.identity],
          adjectives: args.personality,
          system: `You are ${args.name}. Your plan is to ${args.plan}.`,
      };

      console.log('Sending JSON request to ElizaOS...');

      const res = await fetch(`${ELIZA_SERVER}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterJson: characterConfig }),
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElizaOS error (${res.status}): ${text}`);
      }
      
      const data = await res.json();
      let elizaAgentId = data.id || data.data?.id; 
      
      if (!elizaAgentId && data.success && data.data) {
         elizaAgentId = data.data.id;
      }
      
      // If still finding it... sometimes it's an array?
      if (!elizaAgentId && Array.isArray(data)) {
        elizaAgentId = data[0]?.id;
      }
      
      if (!elizaAgentId) {
          console.error("ElizaOS Response:", data);
          throw new Error("Failed to parse Eliza Agent ID from response");
      }
      
      console.log(`Eliza Agent created: ${elizaAgentId}`);

      // 2. Create game player using existing API
      // We use api.world.createAgent to create the character in the game engine
      // casting to any to avoid circular type inference issues
      const inputId: any = await ctx.runMutation(api.world.createAgent, {
         worldId: args.worldId,
         name: args.name,
         character: args.character,
         identity: args.identity,
         plan: args.plan,
      });
      
      // 3. Save Mapping
      // We can't link playerId yet as it's created asynchronously by the engine.
      // We map by name/worldId for now, or just store the record.
      await ctx.runMutation(internal.elizaAgent.mutations.saveMapping, {
         worldId: args.worldId,
         name: args.name, 
         elizaAgentId,
         bio: args.identity,
         personality: args.personality,
         // playerId Left undefined for now, to be linked later if needed
      });
      
      return { inputId, elizaAgentId };
    } catch (e: any) {
        console.error("Create Eliza Agent Failed", e);
        throw new Error("Failed to create Eliza Agent: " + e.message);
    }
  },
});

export const sendMessage = internalAction({
  args: {
    elizaAgentId: v.string(),
    message: v.string(),
    senderId: v.string(),
    conversationId: v.string(),
  },
  handler: async (ctx, args) => {
    const res = await fetch(
      `${ELIZA_SERVER}/api/agents/${args.elizaAgentId}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: args.message, 
          userId: args.senderId,
          roomId: args.conversationId,
        }),
      }
    );
    
    if (!res.ok) {
         console.error("Eliza Chat Error", await res.text());
         return null; 
    }
    
    const data = await res.json();
    console.log("Eliza Response:", data);
    
    if (Array.isArray(data) && data.length > 0) {
        return data[0].text;
    }
    return null;
  },
});
