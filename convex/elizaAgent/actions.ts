/**
 * ElizaOS Actions for AI Town - REAL ElizaOS Runtime
 *
 * This module runs the ACTUAL ElizaOS AgentRuntime in Convex actions.
 * Uses runtime.messageService.handleMessage for canonical agent behavior.
 */

"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import {
  AgentRuntime,
  ChannelType,
  type Character,
  createMessageMemory,
  stringToUuid,
  type UUID,
  type Content,
  type Memory,
} from "@elizaos/core";
import { openaiPlugin } from "@elizaos/plugin-openai";

/**
 * Build a Character object manually.
 * (createCharacter is not exported in browser bundle used by Convex bundler)
 */
function buildElizaCharacter(opts: {
  name: string;
  bio: string;
  system: string;
  secrets?: Record<string, string>;
}): Character {
  return {
    name: opts.name,
    bio: opts.bio,
    system: opts.system,
    secrets: opts.secrets || {},
    settings: {},
  } as Character;
}

// =============================================================================
// Types
// =============================================================================

export interface ElizaCharacter {
  name: string;
  bio: string[];
  personality: string[];
  systemPrompt: string;
  goals?: string[];
  quirks?: string[];
}

export interface AgentContext {
  agentId: string;
  playerId: string;
  character: ElizaCharacter;
  position: { x: number; y: number };
  nearbyAgents: NearbyAgent[];
  recentMessages: ChatMessage[];
  currentActivity?: string;
  currentConversation?: ConversationContext;
  worldTime: number;
  lastDecision?: string;
}

export interface NearbyAgent {
  id: string;
  name: string;
  position: { x: number; y: number };
  distance: number;
  activity?: string;
  isInConversation: boolean;
}

export interface ChatMessage {
  from: string;
  text: string;
  timestamp: number;
}

export interface ConversationContext {
  conversationId: string;
  participants: string[];
  recentMessages: ChatMessage[];
}

// Decision types that the agent can make
export type AgentDecision =
  | { type: "move"; x: number; y: number; reason: string }
  | {
      type: "activity";
      description: string;
      emoji: string;
      duration: number;
      reason: string;
    }
  | { type: "converse"; targetName: string; targetId: string; greeting: string }
  | { type: "say"; text: string }
  | { type: "leave_conversation"; reason: string }
  | { type: "wander"; reason: string }
  | { type: "idle"; reason: string };

// =============================================================================
// Runtime Cache (per-action, reused within same action invocation)
// =============================================================================

const runtimeCache = new Map<string, AgentRuntime>();

async function getOrCreateRuntime(
  agentId: string,
  character: ElizaCharacter
): Promise<AgentRuntime> {
  // Check cache first
  if (runtimeCache.has(agentId)) {
    return runtimeCache.get(agentId)!;
  }

  // Build secrets from environment
  const secrets: Record<string, string> = {};
  if (process.env.OPENAI_API_KEY) {
    secrets.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    secrets.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.GROQ_API_KEY) {
    secrets.GROQ_API_KEY = process.env.GROQ_API_KEY;
  }

  // Create ElizaOS Character
  const elizaCharacter: Character = buildElizaCharacter({
    name: character.name,
    bio: character.bio.join("\n"),
    system: character.systemPrompt,
    secrets,
  });

  // Create the runtime
  const runtime = new AgentRuntime({
    character: elizaCharacter,
    plugins: [openaiPlugin],
  });

  await runtime.initialize();

  runtimeCache.set(agentId, runtime);
  return runtime;
}

// =============================================================================
// Helper: Build prompt from context
// =============================================================================

function buildContextPrompt(context: AgentContext): string {
  const lines: string[] = [];

  lines.push(`=== AI TOWN SIMULATION ===`);
  lines.push(`You are ${context.character.name} in AI Town, a social simulation.`);
  lines.push(`Position: (${context.position.x.toFixed(1)}, ${context.position.y.toFixed(1)})`);

  if (context.currentActivity) {
    lines.push(`Current activity: ${context.currentActivity}`);
  }

  // Nearby agents
  lines.push(`\n=== NEARBY CHARACTERS ===`);
  if (context.nearbyAgents.length === 0) {
    lines.push(`No one is nearby.`);
  } else {
    for (const agent of context.nearbyAgents) {
      const status = agent.isInConversation
        ? "(in conversation)"
        : agent.activity || "(idle)";
      lines.push(
        `- ${agent.name} at (${agent.position.x.toFixed(1)}, ${agent.position.y.toFixed(1)}) [${agent.distance.toFixed(1)} units away] ${status}`
      );
    }
  }

  // Conversation context
  if (context.currentConversation) {
    lines.push(`\n=== CURRENT CONVERSATION ===`);
    lines.push(
      `Participants: ${context.currentConversation.participants.join(", ")}`
    );
    lines.push(`Recent messages:`);
    for (const msg of context.currentConversation.recentMessages.slice(-10)) {
      lines.push(`  ${msg.from}: "${msg.text}"`);
    }
  }

  // Available actions
  if (context.currentConversation) {
    lines.push(`\n=== AVAILABLE ACTIONS ===`);
    lines.push(`You can: SAY (speak in conversation), LEAVE_CONVERSATION`);
    lines.push(`Respond with your action in this format:`);
    lines.push(`ACTION: SAY`);
    lines.push(`TEXT: Your message here`);
    lines.push(`OR`);
    lines.push(`ACTION: LEAVE_CONVERSATION`);
    lines.push(`REASON: Why you're leaving`);
  } else {
    lines.push(`\n=== AVAILABLE ACTIONS ===`);
    lines.push(
      `MOVE (x, y), CONVERSE (start talking to someone), ACTIVITY, WANDER, IDLE`
    );
    lines.push(`Respond with your chosen action:`);
    lines.push(`ACTION: MOVE`);
    lines.push(`X: 25`);
    lines.push(`Y: 30`);
    lines.push(`REASON: Going to explore the park`);
    lines.push(`OR`);
    lines.push(`ACTION: CONVERSE`);
    lines.push(`TARGET: Alice`);
    lines.push(`GREETING: Hello Alice!`);
  }

  return lines.join("\n");
}

// =============================================================================
// Helper: Parse LLM response into decision
// =============================================================================

function parseDecisionFromResponse(
  response: string,
  context: AgentContext
): AgentDecision {
  const lines = response.split("\n");
  let action = "";
  const fields: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("ACTION:")) {
      action = trimmed.replace("ACTION:", "").trim().toUpperCase();
    } else if (trimmed.includes(":")) {
      const [key, ...valueParts] = trimmed.split(":");
      fields[key.trim().toUpperCase()] = valueParts.join(":").trim();
    }
  }

  switch (action) {
    case "MOVE": {
      const x = parseFloat(fields["X"] || "0");
      const y = parseFloat(fields["Y"] || "0");
      return {
        type: "move",
        x: Math.max(0, Math.min(50, x)),
        y: Math.max(0, Math.min(50, y)),
        reason: fields["REASON"] || "Moving",
      };
    }

    case "SAY": {
      return {
        type: "say",
        text: fields["TEXT"] || fields["MESSAGE"] || "Hello!",
      };
    }

    case "CONVERSE": {
      const targetName = fields["TARGET"] || fields["NAME"] || "";
      const target = context.nearbyAgents.find(
        (a) => a.name.toLowerCase() === targetName.toLowerCase()
      );
      if (target) {
        return {
          type: "converse",
          targetName: target.name,
          targetId: target.id,
          greeting: fields["GREETING"] || "Hello!",
        };
      }
      return { type: "wander", reason: "Could not find target" };
    }

    case "ACTIVITY": {
      return {
        type: "activity",
        description: fields["DESCRIPTION"] || "Doing something",
        emoji: fields["EMOJI"] || "💭",
        duration: parseInt(fields["DURATION"] || "30", 10),
        reason: fields["REASON"] || "",
      };
    }

    case "LEAVE_CONVERSATION": {
      return {
        type: "leave_conversation",
        reason: fields["REASON"] || "Time to go",
      };
    }

    case "WANDER": {
      return { type: "wander", reason: fields["REASON"] || "Exploring" };
    }

    case "IDLE":
    default: {
      return { type: "idle", reason: fields["REASON"] || "Resting" };
    }
  }
}

// =============================================================================
// Character Creation Helper
// =============================================================================

export function createCharacterFromConfig(config: {
  name: string;
  identity: string;
  plan: string;
  personality: string[];
}): ElizaCharacter {
  return {
    name: config.name,
    bio: [config.identity],
    personality: config.personality,
    systemPrompt: `You are ${config.name}, a character in AI Town.
${config.identity}

Your current plan: ${config.plan}

Personality traits: ${config.personality.join(", ")}

You interact naturally with other characters in the town. Be social, curious, and true to your personality.`,
    goals: [config.plan],
    quirks: [],
  };
}

// =============================================================================
// Agent Creation
// =============================================================================

export const createElizaAgent = action({
  args: {
    worldId: v.id("worlds"),
    name: v.string(),
    character: v.string(),
    identity: v.string(),
    plan: v.string(),
    personality: v.array(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ inputId: Id<"inputs"> | string; elizaAgentId: string }> => {
    console.log(`[ElizaOS] Creating agent: ${args.name}`);

    const elizaAgentId = `eliza-${args.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

    const inputId: Id<"inputs"> | string = await ctx.runMutation(
      api.world.createAgent,
      {
        worldId: args.worldId,
        name: args.name,
        character: args.character,
        identity: args.identity,
        plan: args.plan,
      }
    );

    await ctx.runMutation(internal.elizaAgent.mutations.saveMapping, {
      worldId: args.worldId,
      name: args.name,
      elizaAgentId,
      bio: args.identity,
      personality: args.personality,
    });

    console.log(`[ElizaOS] Agent created: ${elizaAgentId}`);
    return { inputId, elizaAgentId };
  },
});

// =============================================================================
// Agent Decision Making - REAL ElizaOS
// =============================================================================

export const askWhatToDo = internalAction({
  args: {
    agentId: v.string(),
    playerId: v.string(),
    worldId: v.id("worlds"),
    position: v.object({ x: v.number(), y: v.number() }),
    nearbyAgents: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        position: v.object({ x: v.number(), y: v.number() }),
        distance: v.number(),
        activity: v.optional(v.string()),
        isInConversation: v.boolean(),
      })
    ),
    recentMessages: v.array(
      v.object({
        from: v.string(),
        text: v.string(),
        timestamp: v.number(),
      })
    ),
    currentActivity: v.optional(v.string()),
    inConversation: v.boolean(),
    conversationId: v.optional(v.string()),
    conversationParticipants: v.optional(v.array(v.string())),
    conversationMessages: v.optional(
      v.array(
        v.object({
          from: v.string(),
          text: v.string(),
          timestamp: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args): Promise<AgentDecision> => {
    // Get agent mapping from DB
    const elizaAgent = await ctx.runQuery(
      internal.elizaAgent.queries.getByPlayerId,
      { playerId: args.playerId }
    );

    // Build character
    const character: ElizaCharacter = elizaAgent
      ? createCharacterFromConfig({
          name: elizaAgent.name,
          identity: elizaAgent.bio,
          plan: "",
          personality: elizaAgent.personality,
        })
      : {
          name: "Agent",
          bio: ["A friendly character in AI Town"],
          personality: ["friendly", "curious"],
          systemPrompt: "You are a friendly character in AI Town.",
        };

    // Build context
    const context: AgentContext = {
      agentId: args.agentId,
      playerId: args.playerId,
      character,
      position: args.position,
      nearbyAgents: args.nearbyAgents as NearbyAgent[],
      recentMessages: args.recentMessages as ChatMessage[],
      currentActivity: args.currentActivity,
      worldTime: Date.now(),
    };

    if (args.inConversation && args.conversationId) {
      context.currentConversation = {
        conversationId: args.conversationId,
        participants: args.conversationParticipants || [],
        recentMessages: (args.conversationMessages || []) as ChatMessage[],
      };
    }

    try {
      // Get or create ElizaOS runtime
      const runtime = await getOrCreateRuntime(args.agentId, character);

      // Build the prompt
      const contextPrompt = buildContextPrompt(context);

      // Create a message for ElizaOS
      const roomId = stringToUuid(`aitown-${args.worldId}-${args.agentId}`);
      const userId = stringToUuid(`system-aitown`);
      const worldId = stringToUuid(`aitown-world-${args.worldId}`);

      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: "AI Town",
        source: "aitown",
        channelId: `aitown-${args.agentId}`,
        serverId: "convex",
        type: ChannelType.API,
      } as Parameters<typeof runtime.ensureConnection>[0]);

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId,
        content: {
          text: contextPrompt,
          source: "aitown",
          channelType: ChannelType.API,
        },
      });

      let responseText = "";

      // Use the canonical messageService.handleMessage
      const result = await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content): Promise<Memory[]> => {
          if (content?.text) {
            responseText = content.text;
          }
          return [];
        }
      );

      // Extract response from result if callback didn't capture it
      if (!responseText && result?.responseContent?.text) {
        responseText = result.responseContent.text;
      }

      console.log(`[ElizaOS] ${character.name} response: ${responseText.slice(0, 100)}...`);

      // Parse the response into a decision
      const decision = parseDecisionFromResponse(responseText, context);
      console.log(`[ElizaOS] ${character.name} decided: ${decision.type}`);

      return decision;
    } catch (error) {
      console.error(`[ElizaOS] Error for ${character.name}:`, error);
      return { type: "wander", reason: "Error making decision" };
    }
  },
});

// =============================================================================
// Chat Response Generation - REAL ElizaOS
// =============================================================================

export const generateResponse = internalAction({
  args: {
    playerId: v.string(),
    conversationHistory: v.array(
      v.object({
        from: v.string(),
        text: v.string(),
        timestamp: v.number(),
      })
    ),
    lastMessage: v.object({
      from: v.string(),
      text: v.string(),
      timestamp: v.number(),
    }),
  },
  handler: async (ctx, args): Promise<string> => {
    const elizaAgent = await ctx.runQuery(
      internal.elizaAgent.queries.getByPlayerId,
      { playerId: args.playerId }
    );

    const character: ElizaCharacter = elizaAgent
      ? createCharacterFromConfig({
          name: elizaAgent.name,
          identity: elizaAgent.bio,
          plan: "",
          personality: elizaAgent.personality,
        })
      : {
          name: "Agent",
          bio: ["A friendly character in AI Town"],
          personality: ["friendly", "curious"],
          systemPrompt: "You are a friendly character in AI Town.",
        };

    try {
      const runtime = await getOrCreateRuntime(args.playerId, character);

      // Build conversation context
      const historyText = args.conversationHistory
        .slice(-10)
        .map((m) => `${m.from}: "${m.text}"`)
        .join("\n");

      const prompt = `${character.systemPrompt}

=== CONVERSATION ===
${historyText}

=== LATEST MESSAGE ===
${args.lastMessage.from}: "${args.lastMessage.text}"

Respond naturally and in character. Keep your response to 1-2 sentences.`;

      const roomId = stringToUuid(`conv-${args.playerId}`);
      const userId = stringToUuid(`system-conv`);
      const worldId = stringToUuid(`aitown-world`);

      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: args.lastMessage.from,
        source: "aitown-conversation",
        channelId: `conv-${args.playerId}`,
        serverId: "convex",
        type: ChannelType.DM,
      } as Parameters<typeof runtime.ensureConnection>[0]);

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId,
        content: {
          text: prompt,
          source: "aitown-conversation",
          channelType: ChannelType.DM,
        },
      });

      let responseText = "";

      await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content): Promise<Memory[]> => {
          if (content?.text) {
            responseText = content.text;
          }
          return [];
        }
      );

      console.log(`[ElizaOS] ${character.name} says: "${responseText}"`);
      return responseText || "I'm not sure what to say right now.";
    } catch (error) {
      console.error(`[ElizaOS] Chat error for ${character.name}:`, error);
      return "I'm not sure what to say right now.";
    }
  },
});

// =============================================================================
// Utility Actions
// =============================================================================

export const checkConfig = action({
  args: {},
  handler: async (): Promise<{ configured: boolean; provider: string | null }> => {
    const providers = [
      { name: "openai", key: "OPENAI_API_KEY" },
      { name: "anthropic", key: "ANTHROPIC_API_KEY" },
      { name: "groq", key: "GROQ_API_KEY" },
    ];

    for (const { name, key } of providers) {
      if (process.env[key]) {
        return { configured: true, provider: name };
      }
    }

    return { configured: false, provider: null };
  },
});

export const testDecision = action({
  args: {
    agentName: v.string(),
  },
  handler: async (_, args): Promise<AgentDecision> => {
    const character = createCharacterFromConfig({
      name: args.agentName,
      identity: "A test character exploring AI Town",
      plan: "Explore and meet new people",
      personality: ["curious", "friendly"],
    });

    const context: AgentContext = {
      agentId: "test-agent",
      playerId: "test-player",
      character,
      position: { x: 25, y: 25 },
      nearbyAgents: [
        {
          id: "nearby-1",
          name: "Alice",
          position: { x: 27, y: 25 },
          distance: 2,
          activity: "Reading",
          isInConversation: false,
        },
      ],
      recentMessages: [],
      worldTime: Date.now(),
    };

    try {
      const runtime = await getOrCreateRuntime("test-agent", character);

      const prompt = buildContextPrompt(context);
      const roomId = stringToUuid("test-room");
      const userId = stringToUuid("test-user");
      const worldId = stringToUuid("test-world");

      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: "Test",
        source: "test",
        channelId: "test",
        serverId: "test",
        type: ChannelType.API,
      } as Parameters<typeof runtime.ensureConnection>[0]);

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId,
        content: {
          text: prompt,
          source: "test",
          channelType: ChannelType.API,
        },
      });

      let responseText = "";

      await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content): Promise<Memory[]> => {
          if (content?.text) {
            responseText = content.text;
          }
          return [];
        }
      );

      return parseDecisionFromResponse(responseText, context);
    } catch (error) {
      console.error("[ElizaOS] Test decision error:", error);
      return { type: "wander", reason: "Error in test" };
    }
  },
});
