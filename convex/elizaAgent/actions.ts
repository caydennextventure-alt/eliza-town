import { action } from '../_generated/server';
import { v } from 'convex/values';
import { anyApi } from 'convex/server';
import { Id } from '../_generated/dataModel';

const normalizeElizaServerUrl = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, '');
};

const normalizeAuthToken = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const resolveElizaAuthToken = (value?: string) =>
  normalizeAuthToken(value) ?? normalizeAuthToken(process.env.ELIZA_SERVER_AUTH_TOKEN);

const buildElizaHeaders = (authToken?: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['X-API-KEY'] = authToken;
  }
  return headers;
};

const DEFAULT_ELIZA_SERVER =
  normalizeElizaServerUrl(process.env.ELIZA_SERVER_URL) ||
  'https://fliza-agent-production.up.railway.app';
// Avoid deep type instantiation in Convex tsc.
const apiAny = anyApi;

export const createElizaAgent = action({
  args: {
    worldId: v.id('worlds'),
    name: v.string(),
    character: v.string(),
    identity: v.string(), // Maps to bio
    plan: v.string(),
    personality: v.array(v.string()), // ['Friendly', 'Curious']
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ inputId: Id<"inputs"> | string; elizaAgentId: string }> => {
    // 1. Create in ElizaOS
    const elizaServerUrlOverride = normalizeElizaServerUrl(args.elizaServerUrl);
    const elizaServerUrl = elizaServerUrlOverride ?? DEFAULT_ELIZA_SERVER;
    const authToken = resolveElizaAuthToken(args.elizaAuthToken);
    const storedAuthToken = normalizeAuthToken(args.elizaAuthToken);
    console.log(`Creating Eliza Agent [${args.name}] at ${elizaServerUrl}...`);
    
    try {
      // Create character JSON object (minimal required fields)
      const characterConfig = {
          name: args.name,
          bio: [args.identity],
          adjectives: args.personality,
          system: `You are ${args.name}. Your plan is to ${args.plan}.`,
      };

      console.log('Sending JSON request to ElizaOS...');

      const res = await fetch(`${elizaServerUrl}/api/agents`, {
        method: 'POST',
        headers: buildElizaHeaders(authToken),
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
      const inputId: any = await ctx.runMutation(apiAny.world.createAgent, {
         worldId: args.worldId,
         name: args.name,
         character: args.character,
         identity: args.identity,
         plan: args.plan,
      });
      
      // 3. Save Mapping
      // We can't link playerId yet as it's created asynchronously by the engine.
      // We map by name/worldId for now, or just store the record.
      await ctx.runMutation(apiAny.elizaAgent.mutations.saveMapping, {
         worldId: args.worldId,
         name: args.name, 
         elizaAgentId,
         bio: args.identity,
         personality: args.personality,
         elizaServerUrl: elizaServerUrlOverride,
         elizaAuthToken: storedAuthToken,
         // playerId Left undefined for now, to be linked later if needed
      });
      
      return { inputId, elizaAgentId };
    } catch (e: any) {
        console.error("Create Eliza Agent Failed", e);
        throw new Error("Failed to create Eliza Agent: " + e.message);
    }
  },
});

export const sendMessage = action({
  args: {
    elizaAgentId: v.string(),
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
    message: v.string(),
    senderId: v.string(),
    conversationId: v.string(),
  },
  handler: async (ctx, args) => {
    const elizaServerUrl = normalizeElizaServerUrl(args.elizaServerUrl) ?? DEFAULT_ELIZA_SERVER;
    const authToken = resolveElizaAuthToken(args.elizaAuthToken);
    const res = await fetch(
      `${elizaServerUrl}/api/agents/${args.elizaAgentId}/message`,
      {
        method: 'POST',
        headers: buildElizaHeaders(authToken),
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
