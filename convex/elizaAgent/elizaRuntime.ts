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
    system: `You are ${name}. ${bio}

Personality: ${personality.join(", ")}

You are in AI Town. When making decisions, respond with JSON:
{ "action": "ACTION_NAME", "params": {...}, "reason": "why" }

Actions: MOVE, CONVERSE, ACTIVITY, SAY, LEAVE_CONVERSATION, WANDER, IDLE`,
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
  const lines = [
    `You are ${ctx.characterName} at (${ctx.position.x.toFixed(1)}, ${ctx.position.y.toFixed(1)}).`,
    ctx.currentActivity ? `Currently: ${ctx.currentActivity}` : "",
    "\n=== NEARBY ===",
    ctx.nearbyAgents.length === 0 ? "No one nearby." : ctx.nearbyAgents.map(a => 
      `- ${a.name} [${a.distance.toFixed(1)} away] ${a.isInConversation ? "(talking)" : a.activity || "(idle)"}`
    ).join("\n"),
  ];
  
  if (ctx.inConversation && ctx.conversationMessages?.length) {
    lines.push("\n=== CONVERSATION ===");
    lines.push(...ctx.conversationMessages.slice(-10).map(m => `${m.from}: "${m.text}"`));
  } else if (ctx.recentMessages.length > 0) {
    lines.push("\n=== OVERHEARD ===");
    lines.push(...ctx.recentMessages.slice(-10).map(m => `${m.from}: "${m.text}"`));
  }
  
  lines.push(`\n=== ACTIONS: ${ctx.availableActions.join(", ")} ===`);
  lines.push(`Respond with JSON: { "action": "NAME", "params": {...}, "reason": "why" }`);
  
  return lines.filter(Boolean).join("\n");
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
