/**
 * ElizaOS Runtime for Convex
 * 
 * Uses the canonical ElizaOS pattern:
 * - AgentRuntime with plugins
 * - createMessageMemory for messages
 * - runtime.messageService.handleMessage for processing
 * 
 * Uses @elizaos/plugin-inmemorydb for in-memory database adapter
 */

"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import {
  AgentRuntime,
  ChannelType,
  type Character,
  createMessageMemory,
  stringToUuid,
  type UUID,
  type Content,
  type Memory,
  type Plugin,
} from "@elizaos/core";
import { openaiPlugin } from "@elizaos/plugin-openai";
// @ts-expect-error - plugin-inmemorydb types
import inmemoryDbPlugin, { InMemoryDatabaseAdapter, MemoryStorage } from "@elizaos/plugin-inmemorydb";
import { townPlugin } from "./townPlugin";

// =============================================================================
// Types
// =============================================================================

export type TownActionType = 
  | "MOVE" 
  | "CONVERSE" 
  | "SAY" 
  | "ACTIVITY" 
  | "LEAVE_CONVERSATION" 
  | "WANDER" 
  | "IDLE";

export interface TownAction {
  type: TownActionType;
  params: Record<string, unknown>;
  reason?: string;
}

// =============================================================================
// Runtime Management
// =============================================================================

let cachedRuntime: AgentRuntime | null = null;
let cachedCharacterName: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
let _cachedAdapter: InMemoryDatabaseAdapter | null = null;

async function getRuntime(name: string, bio: string, personality: string[], agentId: string): Promise<AgentRuntime> {
  if (cachedRuntime && cachedCharacterName === name) {
    return cachedRuntime;
  }
  
  // Create character object (ElizaOS Character type)
  const character: Character = {
    name,
    bio: [`${bio} Personality: ${personality.join(", ")}`],
    system: `You are ${name}, a character living in AI Town. ${bio}

Your personality traits: ${personality.join(", ")}

BEHAVIOR GUIDELINES:
- Be proactive and social - seek out conversations with nearby characters
- If someone is close and available, CONVERSE with them
- If alone, WANDER to explore and find others
- Do ACTIVITY only when it fits your character
- Use IDLE sparingly - prefer action

IMPORTANT: You MUST respond with ONLY a valid JSON object. No other text.
Format: { "action": "ACTION_NAME", "params": {...}, "reason": "brief reason" }

Valid actions: MOVE, CONVERSE, ACTIVITY, WANDER, IDLE`,
  };
  
  // Create and initialize the in-memory database adapter from official plugin
  const storage = new MemoryStorage();
  const databaseAdapter = new InMemoryDatabaseAdapter(storage, stringToUuid(agentId));
  await databaseAdapter.init();
  _cachedAdapter = databaseAdapter;
  console.log(`[ElizaOS] In-memory database adapter initialized for agent ${agentId}`);
  
  // Create runtime with inmemorydb plugin and AI Town actions (canonical ElizaOS pattern)
  const runtime = new AgentRuntime({
    character,
    plugins: [inmemoryDbPlugin as Plugin, openaiPlugin as Plugin, townPlugin as Plugin],
  });
  
  // Register the database adapter (required before initialize)
  runtime.registerDatabaseAdapter(databaseAdapter);
  console.log(`[ElizaOS] Database adapter registered for ${name}`);
  
  await runtime.initialize();
  
  cachedRuntime = runtime;
  cachedCharacterName = name;
  
  console.log(`[ElizaOS] Created AgentRuntime for ${name}`);
  return runtime;
}

// =============================================================================
// Main Actions
// =============================================================================

export const makeAgentDecision = internalAction({
  args: {
    agentId: v.string(),
    playerId: v.string(),
    worldId: v.id("worlds"),
    characterName: v.string(),
    characterBio: v.string(),
    characterPersonality: v.array(v.string()),
    position: v.object({ x: v.number(), y: v.number() }),
    nearbyAgents: v.array(v.object({
      id: v.string(),
      name: v.string(),
      position: v.object({ x: v.number(), y: v.number() }),
      distance: v.number(),
      activity: v.optional(v.string()),
      isInConversation: v.boolean()
    })),
    recentMessages: v.array(v.object({
      from: v.string(),
      text: v.string()
    })),
    currentActivity: v.optional(v.string()),
    inConversation: v.boolean(),
    conversationMessages: v.optional(v.array(v.object({
      from: v.string(),
      text: v.string()
    })))
  },
  handler: async (ctx, args): Promise<TownAction> => {
    try {
      const runtime = await getRuntime(args.characterName, args.characterBio, args.characterPersonality, args.agentId);
      
      const availableActions: TownActionType[] = args.inConversation
        ? ["SAY", "LEAVE_CONVERSATION"]
        : ["MOVE", "CONVERSE", "ACTIVITY", "WANDER", "IDLE"];
      
      const prompt = buildPrompt({
        characterName: args.characterName,
        position: args.position,
        nearbyAgents: args.nearbyAgents,
        recentMessages: args.recentMessages,
        currentActivity: args.currentActivity,
        inConversation: args.inConversation,
        conversationMessages: args.conversationMessages,
        availableActions
      });
      
      // Setup connection (ElizaOS pattern)
      const userId = stringToUuid(`system-aitown`);
      const roomId = stringToUuid(`aitown-${args.worldId}-${args.agentId}`);
      const worldId = stringToUuid(`world-${args.worldId}`);
      
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: "AI Town System",
        source: "aitown",
        channelId: `aitown-${args.agentId}`,
        type: ChannelType.API,
      });
      
      // Create message (ElizaOS pattern)
      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId,
        content: {
          text: prompt,
          source: "aitown",
          channelType: ChannelType.API,
        },
      });
      
      // Handle message (CANONICAL ElizaOS pattern)
      let responseText = "";
      await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content): Promise<Memory[]> => {
          if (content?.text) {
            responseText += content.text;
          }
          return [];
        },
      );
      
      console.log(`[ElizaOS] ${args.characterName}: ${responseText.slice(0, 100)}...`);
      return parseAction(responseText, availableActions);
      
    } catch (error) {
      console.error(`[ElizaOS] Error:`, error);
      return { type: "IDLE", params: {}, reason: "Error" };
    }
  }
});

export const generateChatResponse = internalAction({
  args: {
    agentId: v.string(),
    characterName: v.string(),
    characterBio: v.string(),
    characterPersonality: v.array(v.string()),
    conversationHistory: v.array(v.object({ from: v.string(), text: v.string() })),
    lastMessage: v.object({ from: v.string(), text: v.string() })
  },
  handler: async (ctx, args): Promise<string> => {
    try {
      const runtime = await getRuntime(args.characterName, args.characterBio, args.characterPersonality, args.agentId);
      
      const history = args.conversationHistory.slice(-10).map(m => `${m.from}: "${m.text}"`).join("\n");
      const prompt = `${history}\n${args.lastMessage.from}: "${args.lastMessage.text}"\nYour response:`;
      
      // Setup connection
      const userId = stringToUuid(`user-conv`);
      const roomId = stringToUuid(`conv-${args.characterName}`);
      const worldId = stringToUuid(`world-conv`);
      
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: args.lastMessage.from,
        source: "aitown-conversation",
        channelId: `conv-${args.characterName}`,
        type: ChannelType.DM,
      });
      
      // Create message
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
      
      // Handle message (CANONICAL ElizaOS pattern)
      let responseText = "";
      await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content): Promise<Memory[]> => {
          if (content?.text) {
            responseText += content.text;
          }
          return [];
        },
      );
      
      console.log(`[ElizaOS] ${args.characterName} says: "${responseText}"`);
      return responseText || "I'm not sure what to say.";
      
    } catch (error) {
      console.error(`[ElizaOS] Chat error:`, error);
      return "I'm not sure what to say.";
    }
  }
});

// =============================================================================
// Action Alias Map
// =============================================================================

const ACTION_ALIASES: Record<string, TownActionType> = {
  // MOVE aliases
  "MOVE": "MOVE", "move": "MOVE", "Move": "MOVE",
  "GO": "MOVE", "go": "MOVE", "Go": "MOVE",
  "WALK": "MOVE", "walk": "MOVE", "Walk": "MOVE",
  "TRAVEL": "MOVE", "travel": "MOVE", "Travel": "MOVE",
  "GO_TO": "MOVE", "go_to": "MOVE", "GOTO": "MOVE", "goto": "MOVE",
  "WALK_TO": "MOVE", "walk_to": "MOVE", "WALKTO": "MOVE", "walkto": "MOVE",
  "RUN": "MOVE", "run": "MOVE", "NAVIGATE": "MOVE", "navigate": "MOVE",
  
  // CONVERSE aliases
  "CONVERSE": "CONVERSE", "converse": "CONVERSE", "Converse": "CONVERSE",
  "TALK": "CONVERSE", "talk": "CONVERSE", "Talk": "CONVERSE",
  "CHAT": "CONVERSE", "chat": "CONVERSE", "Chat": "CONVERSE",
  "SPEAK": "CONVERSE", "speak": "CONVERSE", "Speak": "CONVERSE",
  "TALK_TO": "CONVERSE", "talk_to": "CONVERSE", "TALKTO": "CONVERSE", "talkto": "CONVERSE",
  "CHAT_WITH": "CONVERSE", "chat_with": "CONVERSE", "CHATWITH": "CONVERSE", "chatwith": "CONVERSE",
  "START_CONVERSATION": "CONVERSE", "start_conversation": "CONVERSE", "STARTCONVERSATION": "CONVERSE",
  "CONVERSATION": "CONVERSE", "conversation": "CONVERSE",
  "GREET": "CONVERSE", "greet": "CONVERSE", "APPROACH": "CONVERSE", "approach": "CONVERSE",
  
  // ACTIVITY aliases
  "ACTIVITY": "ACTIVITY", "activity": "ACTIVITY", "Activity": "ACTIVITY",
  "DO": "ACTIVITY", "do": "ACTIVITY", "Do": "ACTIVITY",
  "PERFORM": "ACTIVITY", "perform": "ACTIVITY", "Perform": "ACTIVITY",
  "START_ACTIVITY": "ACTIVITY", "start_activity": "ACTIVITY", "STARTACTIVITY": "ACTIVITY",
  "DO_ACTIVITY": "ACTIVITY", "do_activity": "ACTIVITY", "DOACTIVITY": "ACTIVITY",
  "ACT": "ACTIVITY", "act": "ACTIVITY", "ACTION": "ACTIVITY", "action": "ACTIVITY",
  "THINK": "ACTIVITY", "think": "ACTIVITY", "READ": "ACTIVITY", "read": "ACTIVITY",
  "WORK": "ACTIVITY", "work": "ACTIVITY",
  
  // SAY aliases
  "SAY": "SAY", "say": "SAY", "Say": "SAY",
  "REPLY": "SAY", "reply": "SAY", "Reply": "SAY",
  "RESPOND": "SAY", "respond": "SAY", "Respond": "SAY",
  "MESSAGE": "SAY", "message": "SAY", "Message": "SAY",
  "TELL": "SAY", "tell": "SAY", "Tell": "SAY",
  "COMMUNICATE": "SAY", "communicate": "SAY",
  
  // LEAVE_CONVERSATION aliases
  "LEAVE_CONVERSATION": "LEAVE_CONVERSATION", "leave_conversation": "LEAVE_CONVERSATION",
  "LeaveConversation": "LEAVE_CONVERSATION", "LEAVECONVERSATION": "LEAVE_CONVERSATION",
  "leaveconversation": "LEAVE_CONVERSATION",
  "EXIT": "LEAVE_CONVERSATION", "exit": "LEAVE_CONVERSATION", "Exit": "LEAVE_CONVERSATION",
  "LEAVE": "LEAVE_CONVERSATION", "leave": "LEAVE_CONVERSATION", "Leave": "LEAVE_CONVERSATION",
  "END_CONVERSATION": "LEAVE_CONVERSATION", "end_conversation": "LEAVE_CONVERSATION",
  "ENDCONVERSATION": "LEAVE_CONVERSATION",
  "GOODBYE": "LEAVE_CONVERSATION", "goodbye": "LEAVE_CONVERSATION",
  "BYE": "LEAVE_CONVERSATION", "bye": "LEAVE_CONVERSATION",
  "END": "LEAVE_CONVERSATION", "end": "LEAVE_CONVERSATION",
  "STOP": "LEAVE_CONVERSATION", "stop": "LEAVE_CONVERSATION",
  "QUIT": "LEAVE_CONVERSATION", "quit": "LEAVE_CONVERSATION",
  "DEPART": "LEAVE_CONVERSATION", "depart": "LEAVE_CONVERSATION",
  
  // WANDER aliases
  "WANDER": "WANDER", "wander": "WANDER", "Wander": "WANDER",
  "EXPLORE": "WANDER", "explore": "WANDER", "Explore": "WANDER",
  "ROAM": "WANDER", "roam": "WANDER", "Roam": "WANDER",
  "STROLL": "WANDER", "stroll": "WANDER", "Stroll": "WANDER",
  "WALK_AROUND": "WANDER", "walk_around": "WANDER", "WALKAROUND": "WANDER", "walkaround": "WANDER",
  "MEANDER": "WANDER", "meander": "WANDER",
  "DRIFT": "WANDER", "drift": "WANDER",
  "PATROL": "WANDER", "patrol": "WANDER",
  
  // IDLE aliases
  "IDLE": "IDLE", "idle": "IDLE", "Idle": "IDLE",
  "WAIT": "IDLE", "wait": "IDLE", "Wait": "IDLE",
  "STAY": "IDLE", "stay": "IDLE", "Stay": "IDLE",
  "OBSERVE": "IDLE", "observe": "IDLE", "Observe": "IDLE",
  "REST": "IDLE", "rest": "IDLE", "Rest": "IDLE",
  "DO_NOTHING": "IDLE", "do_nothing": "IDLE", "DONOTHING": "IDLE", "donothing": "IDLE",
  "NOTHING": "IDLE", "nothing": "IDLE",
  "PAUSE": "IDLE", "pause": "IDLE",
  "STAND": "IDLE", "stand": "IDLE",
  "RELAX": "IDLE", "relax": "IDLE",
};

/**
 * Normalize an action name to a canonical TownActionType using the alias map.
 * Falls back to uppercase version if no alias found, then to undefined if invalid.
 */
function normalizeActionName(name: string): TownActionType | undefined {
  // Try direct alias lookup first
  if (name in ACTION_ALIASES) {
    return ACTION_ALIASES[name];
  }
  // Try uppercase version
  const upper = name.toUpperCase();
  if (upper in ACTION_ALIASES) {
    return ACTION_ALIASES[upper];
  }
  // Try with underscores removed
  const noUnderscores = name.replace(/_/g, "").toUpperCase();
  if (noUnderscores in ACTION_ALIASES) {
    return ACTION_ALIASES[noUnderscores];
  }
  return undefined;
}

// =============================================================================
// Helpers
// =============================================================================

function buildPrompt(ctx: {
  characterName: string;
  position: { x: number; y: number };
  nearbyAgents: Array<{ name: string; distance: number; activity?: string; isInConversation: boolean }>;
  recentMessages: Array<{ from: string; text: string }>;
  currentActivity?: string;
  inConversation: boolean;
  conversationMessages?: Array<{ from: string; text: string }>;
  availableActions: TownActionType[];
}): string {
  const lines: string[] = [];
  
  // Current state
  lines.push(`You are ${ctx.characterName} in AI Town at position (${ctx.position.x.toFixed(0)}, ${ctx.position.y.toFixed(0)}).`);
  if (ctx.currentActivity) {
    lines.push(`Currently doing: ${ctx.currentActivity}`);
  }
  
  // Nearby agents - sort by distance
  lines.push("\n=== NEARBY CHARACTERS ===");
  if (ctx.nearbyAgents.length === 0) {
    lines.push("No one nearby. Consider wandering to find others or doing an activity.");
  } else {
    const sorted = [...ctx.nearbyAgents].sort((a, b) => a.distance - b.distance);
    sorted.forEach(a => {
      const status = a.isInConversation ? "(in conversation)" : a.activity ? `(${a.activity})` : "(available)";
      lines.push(`- ${a.name}: ${a.distance.toFixed(1)} tiles away ${status}`);
    });
    
    // Encourage interaction with nearby available agents
    const available = sorted.filter(a => !a.isInConversation);
    if (available.length > 0 && available[0].distance < 5) {
      lines.push(`\n${available[0].name} is close and available to talk!`);
    }
  }
  
  // Recent messages
  if (ctx.inConversation && ctx.conversationMessages?.length) {
    lines.push("\n=== CURRENT CONVERSATION ===");
    ctx.conversationMessages.slice(-8).forEach(m => lines.push(`${m.from}: "${m.text}"`));
  } else if (ctx.recentMessages.length > 0) {
    lines.push("\n=== OVERHEARD RECENTLY ===");
    ctx.recentMessages.slice(-5).forEach(m => lines.push(`${m.from}: "${m.text}"`));
  }
  
  // Action instructions
  lines.push("\n=== YOUR DECISION ===");
  lines.push(`Available actions: ${ctx.availableActions.join(", ")}`);
  lines.push("");
  lines.push("Action details:");
  if (ctx.availableActions.includes("CONVERSE")) {
    lines.push('- CONVERSE: Start talking to someone. params: { "target": "Name" }');
  }
  if (ctx.availableActions.includes("MOVE")) {
    lines.push('- MOVE: Walk to a location. params: { "x": number, "y": number }');
  }
  if (ctx.availableActions.includes("WANDER")) {
    lines.push('- WANDER: Explore randomly. params: {}');
  }
  if (ctx.availableActions.includes("ACTIVITY")) {
    lines.push('- ACTIVITY: Do something. params: { "description": "what", "emoji": "🎯", "duration": 30 }');
  }
  if (ctx.availableActions.includes("IDLE")) {
    lines.push('- IDLE: Stay put. params: {}');
  }
  
  lines.push("");
  lines.push('Respond with ONLY a JSON object: { "action": "ACTION_NAME", "params": {...}, "reason": "brief reason" }');
  
  return lines.join("\n");
}

function parseAction(response: string, available: TownActionType[]): TownAction {
  const match = response.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { action?: string; params?: Record<string, unknown>; reason?: string };
      const rawAction = parsed.action || "IDLE";
      
      // Use alias normalization to handle various action name formats
      const normalizedType = normalizeActionName(rawAction);
      
      if (normalizedType && available.includes(normalizedType)) {
        return { type: normalizedType, params: parsed.params || {}, reason: parsed.reason };
      }
      
      // If normalization failed, try direct uppercase match as fallback
      const upperType = rawAction.toUpperCase() as TownActionType;
      if (available.includes(upperType)) {
        return { type: upperType, params: parsed.params || {}, reason: parsed.reason };
      }
      
      // Log unrecognized action for debugging
      console.warn(`[ElizaOS] Unrecognized action "${rawAction}", defaulting to IDLE`);
    } catch { /* ignore parse errors */ }
  }
  return { type: "IDLE", params: {}, reason: "Could not parse" };
}

// =============================================================================
// Memory Operations (ElizaOS-powered)
// =============================================================================

export const summarizeConversation = internalAction({
  args: {
    playerName: v.string(),
    otherPlayerName: v.string(),
    messages: v.array(v.object({
      author: v.string(),
      text: v.string(),
    })),
  },
  handler: async (_ctx, args): Promise<string> => {
    try {
      const runtime = await getRuntime(args.playerName, "A character in AI Town", ["observant", "reflective"], `memory-${args.playerName}`);
      
      // Build conversation text
      const conversationText = args.messages
        .map(m => `${m.author}: "${m.text}"`)
        .join("\n");
      
      const prompt = `You are ${args.playerName}, and you just finished a conversation with ${args.otherPlayerName}. 
Summarize the conversation from your perspective, using first-person pronouns like "I," and add if you liked or disliked this interaction.

The conversation:
${conversationText}

Summary:`;
      
      // Setup connection
      const userId = stringToUuid(`memory-system`);
      const roomId = stringToUuid(`memory-${args.playerName}`);
      const worldId = stringToUuid(`memory-world`);
      
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: "Memory System",
        source: "memory",
        channelId: `memory-${args.playerName}`,
        type: ChannelType.API,
      });
      
      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId,
        content: {
          text: prompt,
          source: "memory",
          channelType: ChannelType.API,
        },
      });
      
      let responseText = "";
      await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content): Promise<Memory[]> => {
          if (content?.text) {
            responseText += content.text;
          }
          return [];
        },
      );
      
      console.log(`[ElizaOS Memory] Summarized conversation for ${args.playerName}`);
      return responseText || "Had a conversation.";
      
    } catch (error) {
      console.error(`[ElizaOS Memory] Summary error:`, error);
      return `Had a conversation with ${args.otherPlayerName}.`;
    }
  }
});

export const calculateMemoryImportance = internalAction({
  args: {
    description: v.string(),
  },
  handler: async (_ctx, args): Promise<number> => {
    try {
      const runtime = await getRuntime("MemoryRater", "A memory importance evaluator", ["analytical"], "memory-rater");
      
      const prompt = `On the scale of 0 to 9, where 0 is purely mundane (e.g., brushing teeth, making bed) and 9 is extremely poignant (e.g., a break up, college acceptance), rate the likely poignancy of the following piece of memory.
Memory: ${args.description}
Answer on a scale of 0 to 9. Respond with number only, e.g. "5"`;
      
      const userId = stringToUuid(`importance-system`);
      const roomId = stringToUuid(`importance-room`);
      const worldId = stringToUuid(`importance-world`);
      
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: "Importance System",
        source: "importance",
        channelId: "importance",
        type: ChannelType.API,
      });
      
      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId,
        content: {
          text: prompt,
          source: "importance",
          channelType: ChannelType.API,
        },
      });
      
      let responseText = "";
      await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content): Promise<Memory[]> => {
          if (content?.text) {
            responseText += content.text;
          }
          return [];
        },
      );
      
      let importance = parseFloat(responseText);
      if (isNaN(importance)) {
        importance = +(responseText.match(/\d+/)?.[0] ?? NaN);
      }
      if (isNaN(importance)) {
        console.debug('[ElizaOS Memory] Could not parse importance from:', responseText);
        importance = 5;
      }
      
      return Math.max(0, Math.min(9, importance));
      
    } catch (error) {
      console.error(`[ElizaOS Memory] Importance error:`, error);
      return 5;
    }
  }
});

export const generateReflection = internalAction({
  args: {
    playerName: v.string(),
    memories: v.array(v.object({
      description: v.string(),
      idx: v.number(),
    })),
  },
  handler: async (_ctx, args): Promise<Array<{ insight: string; statementIds: number[] }>> => {
    try {
      const runtime = await getRuntime(args.playerName, "A reflective character", ["introspective", "thoughtful"], `reflection-${args.playerName}`);
      
      const prompt = ['[no prose]', '[Output only JSON]', `You are ${args.playerName}, statements about you:`];
      args.memories.forEach((m) => {
        prompt.push(`Statement ${m.idx}: ${m.description}`);
      });
      prompt.push('What 3 high-level insights can you infer from the above statements?');
      prompt.push(
        'Return in JSON format, where the key is a list of input statements that contributed to your insights and value is your insight. Make the response parseable by Typescript JSON.parse() function. DO NOT escape characters or include "\\n" or white space in response.',
      );
      prompt.push(
        'Example: [{"insight": "...", "statementIds": [1,2]}, {"insight": "...", "statementIds": [1]}, ...]',
      );
      
      const userId = stringToUuid(`reflection-system`);
      const roomId = stringToUuid(`reflection-${args.playerName}`);
      const worldId = stringToUuid(`reflection-world`);
      
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: "Reflection System",
        source: "reflection",
        channelId: `reflection-${args.playerName}`,
        type: ChannelType.API,
      });
      
      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId,
        content: {
          text: prompt.join("\n"),
          source: "reflection",
          channelType: ChannelType.API,
        },
      });
      
      let responseText = "";
      await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content): Promise<Memory[]> => {
          if (content?.text) {
            responseText += content.text;
          }
          return [];
        },
      );
      
      // Parse JSON response
      const match = responseText.match(/\[[\s\S]*\]/);
      if (match) {
        const insights = JSON.parse(match[0]) as Array<{ insight: string; statementIds: number[] }>;
        console.log(`[ElizaOS Memory] Generated ${insights.length} reflections for ${args.playerName}`);
        return insights;
      }
      
      return [];
      
    } catch (error) {
      console.error(`[ElizaOS Memory] Reflection error:`, error);
      return [];
    }
  }
});
