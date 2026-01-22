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
import { townPlugin, setTownContext, clearTownContext, type AITownContext } from "./townPlugin";

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
  // NOTE: Keep system prompt minimal - context comes from aitown-context Provider
  const character: Character = {
    name,
    bio: [`${bio}`],
    // System prompt defines IDENTITY only - context/actions come from Provider
    system: `You are ${name}, a character living in AI Town.

${bio}

Personality traits: ${personality.join(", ")}

You will receive context about your surroundings from the AI Town system. 
Make decisions that fit your personality and the situation.`,
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
  handler: async (_ctx, args): Promise<TownAction> => {
    const availableActions: TownActionType[] = args.inConversation
      ? ["SAY", "LEAVE_CONVERSATION"]
      : ["MOVE", "CONVERSE", "ACTIVITY", "WANDER", "IDLE"];
    
    // Set the AI Town context for the Provider to use
    const townContext: AITownContext = {
      characterName: args.characterName,
      position: args.position,
      nearbyAgents: args.nearbyAgents,
      recentMessages: args.recentMessages,
      currentActivity: args.currentActivity,
      inConversation: args.inConversation,
      conversationMessages: args.conversationMessages,
      availableActions,
    };
    setTownContext(townContext);
    
    try {
      const runtime = await getRuntime(args.characterName, args.characterBio, args.characterPersonality, args.agentId);
      
      // Build the decision prompt - context is also provided by the aitown-context Provider
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
      
      // Create message memory (ElizaOS pattern)
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
      
      // Handle message using ElizaOS messageService (CANONICAL pattern)
      // The aitown-context Provider injects game context, and townPlugin actions are available
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
      
      console.log(`[ElizaOS] ${args.characterName} decision: ${responseText.slice(0, 100)}...`);
      return parseAction(responseText, availableActions);
      
    } catch (error) {
      console.error(`[ElizaOS] Decision error for ${args.characterName}:`, error);
      return { type: "IDLE", params: {}, reason: "Processing error" };
    } finally {
      // Always clear the context after the call
      clearTownContext();
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
      
      if (!responseText) {
        console.warn(`[ElizaOS] ${args.characterName} got empty chat response, using fallback`);
        return "Hmm...";
      }
      console.log(`[ElizaOS] ${args.characterName} says: "${responseText}"`);
      return responseText;
      
    } catch (error) {
      console.error(`[ElizaOS] Chat error for ${args.characterName}:`, error);
      return "...";
    }
  }
});

// =============================================================================
// Invite Decision (ElizaOS-powered)
// =============================================================================

export const decideOnInvite = internalAction({
  args: {
    agentId: v.string(),
    characterName: v.string(),
    characterBio: v.string(),
    characterPersonality: v.array(v.string()),
    inviterName: v.string(),
    inviterActivity: v.optional(v.string()),
    currentActivity: v.optional(v.string()),
    recentInteractionWithInviter: v.optional(v.boolean()),
  },
  handler: async (_ctx, args): Promise<{ accept: boolean; reason: string }> => {
    try {
      const runtime = await getRuntime(args.characterName, args.characterBio, args.characterPersonality, args.agentId);
      
      const prompt = `You are ${args.characterName}. ${args.inviterName} is approaching you and wants to start a conversation.

Your current state:
${args.currentActivity ? `- You are currently: ${args.currentActivity}` : '- You are not doing anything in particular'}
${args.recentInteractionWithInviter ? `- You recently talked to ${args.inviterName}` : ''}

${args.inviterName}'s state:
${args.inviterActivity ? `- They appear to be: ${args.inviterActivity}` : '- They are approaching you'}

Based on your personality (${args.characterPersonality.join(', ')}), should you accept this conversation invite?

IMPORTANT: Respond with ONLY a valid JSON object. No other text.
Format: { "accept": true/false, "reason": "brief reason for your decision" }`;

      const userId = stringToUuid(`invite-system`);
      const roomId = stringToUuid(`invite-${args.agentId}`);
      const worldId = stringToUuid(`invite-world`);
      
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: "Invite System",
        source: "invite",
        channelId: `invite-${args.agentId}`,
        type: ChannelType.API,
      });
      
      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId,
        content: {
          text: prompt,
          source: "invite",
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
      
      // Parse the response
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]) as { accept?: boolean; reason?: string };
          const accept = parsed.accept === true;
          console.log(`[ElizaOS] ${args.characterName} ${accept ? 'accepts' : 'rejects'} invite from ${args.inviterName}: ${parsed.reason}`);
          return { accept, reason: parsed.reason || (accept ? "Happy to chat" : "Not interested right now") };
        } catch { /* parse error */ }
      }
      
      // Default to accepting (friendly behavior) - ElizaOS returned unparseable response
      // This is intentional - agents should be social by default
      console.warn(`[ElizaOS] ${args.characterName} got unparseable invite response, defaulting to accept (social behavior)`);
      return { accept: true, reason: "Seems friendly" };
      
    } catch (error) {
      // Error fallback: default to accepting (agents should be social)
      // This ensures the world stays active even if there are transient errors
      console.error(`[ElizaOS] Invite decision error for ${args.characterName}:`, error);
      return { accept: true, reason: "Open to conversation" };
    }
  }
});

// =============================================================================
// Smart Wander (ElizaOS-powered destination selection)
// =============================================================================

export const chooseWanderDestination = internalAction({
  args: {
    agentId: v.string(),
    characterName: v.string(),
    characterBio: v.string(),
    characterPersonality: v.array(v.string()),
    currentPosition: v.object({ x: v.number(), y: v.number() }),
    mapWidth: v.number(),
    mapHeight: v.number(),
    nearbyAgents: v.array(v.object({
      name: v.string(),
      position: v.object({ x: v.number(), y: v.number() }),
      distance: v.number(),
    })),
  },
  handler: async (_ctx, args): Promise<{ x: number; y: number; reason: string }> => {
    try {
      const runtime = await getRuntime(args.characterName, args.characterBio, args.characterPersonality, args.agentId);
      
      const nearbyInfo = args.nearbyAgents.length > 0
        ? `Nearby characters: ${args.nearbyAgents.map(a => `${a.name} at (${a.position.x.toFixed(0)}, ${a.position.y.toFixed(0)})`).join(', ')}`
        : 'No one is nearby.';
      
      const prompt = `You are ${args.characterName}, deciding where to wander in AI Town.

Current position: (${args.currentPosition.x.toFixed(0)}, ${args.currentPosition.y.toFixed(0)})
Map size: ${args.mapWidth} x ${args.mapHeight}
${nearbyInfo}

Your personality: ${args.characterPersonality.join(', ')}

Where would you like to wander? Consider:
- Moving toward interesting areas
- Maybe approaching other characters if you're social
- Exploring new areas

IMPORTANT: Respond with ONLY a valid JSON object. No other text.
Format: { "x": number, "y": number, "reason": "brief reason" }

Keep coordinates within bounds: x from 1 to ${args.mapWidth - 2}, y from 1 to ${args.mapHeight - 2}`;

      const userId = stringToUuid(`wander-system`);
      const roomId = stringToUuid(`wander-${args.agentId}`);
      const worldId = stringToUuid(`wander-world`);
      
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: "Wander System",
        source: "wander",
        channelId: `wander-${args.agentId}`,
        type: ChannelType.API,
      });
      
      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId,
        content: {
          text: prompt,
          source: "wander",
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
      
      // Parse the response
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]) as { x?: number; y?: number; reason?: string };
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            const x = Math.max(1, Math.min(args.mapWidth - 2, Math.round(parsed.x)));
            const y = Math.max(1, Math.min(args.mapHeight - 2, Math.round(parsed.y)));
            console.log(`[ElizaOS] ${args.characterName} wanders to (${x}, ${y}): ${parsed.reason}`);
            return { x, y, reason: parsed.reason || "Exploring" };
          }
        } catch { /* parse error */ }
      }
      
      // Fallback: ElizaOS returned unparseable response
      // Move toward center of map (a reasonable default exploration target)
      const centerX = Math.floor(args.mapWidth / 2);
      const centerY = Math.floor(args.mapHeight / 2);
      // Add some variation based on current position to avoid clustering
      const offsetX = Math.floor((args.currentPosition.x - centerX) * 0.3);
      const offsetY = Math.floor((args.currentPosition.y - centerY) * 0.3);
      const x = Math.max(1, Math.min(args.mapWidth - 2, centerX - offsetX));
      const y = Math.max(1, Math.min(args.mapHeight - 2, centerY - offsetY));
      console.warn(`[ElizaOS] ${args.characterName} got unparseable wander response, moving toward center area (${x}, ${y})`);
      return { x, y, reason: "Exploring the town" };
      
    } catch (error) {
      // Error fallback: move toward map center (reasonable default)
      console.error(`[ElizaOS] Wander decision error for ${args.characterName}:`, error);
      const centerX = Math.floor(args.mapWidth / 2);
      const centerY = Math.floor(args.mapHeight / 2);
      return { x: centerX, y: centerY, reason: "Going to explore" };
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

/**
 * Build a minimal decision prompt.
 * 
 * NOTE: Most context is now provided by the aitown-context Provider.
 * This prompt just triggers the decision-making process.
 */
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
  // Minimal prompt - the Provider injects full context
  // This just triggers the agent to make a decision
  if (ctx.inConversation) {
    return `What do you want to do in this conversation? Choose SAY or LEAVE_CONVERSATION.`;
  }
  
  const nearbyAvailable = ctx.nearbyAgents.filter(a => !a.isInConversation);
  if (nearbyAvailable.length > 0 && nearbyAvailable[0].distance < 5) {
    return `${nearbyAvailable[0].name} is nearby. What do you want to do?`;
  }
  
  if (ctx.nearbyAgents.length === 0) {
    return `You're alone. What do you want to do?`;
  }
  
  return `What do you want to do next?`;
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
      
      if (!responseText) {
        console.warn(`[ElizaOS Memory] ${args.playerName} got empty summary response, using fallback`);
        return `Talked with ${args.otherPlayerName}.`;
      }
      console.log(`[ElizaOS Memory] Summarized conversation for ${args.playerName}`);
      return responseText;
      
    } catch (error) {
      console.error(`[ElizaOS Memory] Summary error for ${args.playerName}:`, error);
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
