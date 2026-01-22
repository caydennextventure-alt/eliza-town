/**
 * ElizaOS Actions for AI Town
 *
 * This module provides the public API for ElizaOS agent interactions.
 * ALL agent logic uses ElizaOS - NO direct chatCompletion calls.
 */

"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// Re-export types from elizaRuntime
export type { TownAction, TownActionType } from "./elizaRuntime";

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

export type AgentDecision =
  | { type: "move"; x: number; y: number; reason: string }
  | { type: "activity"; description: string; emoji: string; duration: number; reason: string }
  | { type: "converse"; targetName: string; targetId: string; greeting: string }
  | { type: "say"; text: string }
  | { type: "leave_conversation"; reason: string }
  | { type: "wander"; reason: string }
  | { type: "idle"; reason: string };

// =============================================================================
// Public Actions (ALL use ElizaOS)
// =============================================================================

/**
 * Create a new ElizaOS agent with character configuration
 */
export const createElizaAgent = action({
  args: {
    worldId: v.id("worlds"),
    playerId: v.string(),
    name: v.string(),
    bio: v.string(),
    personality: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; name: string; agentId: string }> => {
    const agentId = await ctx.runMutation(internal.elizaAgent.mutations.createAgent, {
      worldId: args.worldId,
      playerId: args.playerId,
      name: args.name,
      bio: args.bio,
      personality: args.personality,
    });
    
    return { success: true, name: args.name, agentId: agentId as string };
  },
});

/**
 * Test action - uses ElizaOS to make a decision
 */
export const testDecision = action({
  args: {},
  handler: async (ctx): Promise<{ response: string }> => {
    // Use ElizaOS runtime for test decision
    const decision = await ctx.runAction(internal.elizaAgent.elizaRuntime.makeAgentDecision, {
      agentId: "test-agent",
      playerId: "test-player",
      worldId: "test-world" as never, // Type hack for test
      characterName: "TestBot",
      characterBio: "A curious character in AI Town for testing.",
      characterPersonality: ["curious", "friendly"],
      position: { x: 25, y: 25 },
      nearbyAgents: [
        { id: "alice-1", name: "Alice", position: { x: 27, y: 25 }, distance: 2, isInConversation: false }
      ],
      recentMessages: [],
      currentActivity: undefined,
      inConversation: false,
      conversationMessages: undefined,
    });
    
    return { response: JSON.stringify(decision) };
  },
});

// =============================================================================
// Agent Decision (delegates to ElizaOS runtime)
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
    // Get agent info
    const elizaAgent = await ctx.runQuery(
      internal.elizaAgent.queries.getByPlayerId,
      { playerId: args.playerId }
    );

    // Call ElizaOS runtime (NO chatCompletion)
    const action = await ctx.runAction(internal.elizaAgent.elizaRuntime.makeAgentDecision, {
      agentId: args.agentId,
      playerId: args.playerId,
      worldId: args.worldId,
      characterName: elizaAgent?.name || "Agent",
      characterBio: elizaAgent?.bio || "A friendly character",
      characterPersonality: elizaAgent?.personality || ["friendly", "curious"],
      position: args.position,
      nearbyAgents: args.nearbyAgents,
      recentMessages: args.recentMessages.map(m => ({ from: m.from, text: m.text })),
      currentActivity: args.currentActivity,
      inConversation: args.inConversation,
      conversationMessages: args.conversationMessages?.map(m => ({ from: m.from, text: m.text })),
    });

    // Convert TownAction to legacy AgentDecision
    const params = action.params as Record<string, unknown>;
    
    switch (action.type) {
      case "MOVE":
        return {
          type: "move",
          x: Number(params.x) || 25,
          y: Number(params.y) || 25,
          reason: action.reason || "Moving",
        };
      case "CONVERSE":
        const target = args.nearbyAgents.find(
          a => a.name.toLowerCase() === String(params.target || "").toLowerCase()
        );
        return {
          type: "converse",
          targetName: String(params.target) || "",
          targetId: target?.id || "",
          greeting: String(params.greeting) || "Hello!",
        };
      case "ACTIVITY":
        return {
          type: "activity",
          description: String(params.description) || "Doing something",
          emoji: String(params.emoji) || "💭",
          duration: Number(params.duration) || 30,
          reason: action.reason || "",
        };
      case "SAY":
        return {
          type: "say",
          text: String(params.text) || "Hello!",
        };
      case "LEAVE_CONVERSATION":
        return {
          type: "leave_conversation",
          reason: action.reason || "Time to go",
        };
      case "WANDER":
        return {
          type: "wander",
          reason: action.reason || "Wandering",
        };
      case "IDLE":
      default:
        return {
          type: "idle",
          reason: action.reason || "Observing",
        };
    }
  },
});

// =============================================================================
// Chat Response (delegates to ElizaOS runtime)
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

    // Use ElizaOS runtime (NO chatCompletion)
    return await ctx.runAction(internal.elizaAgent.elizaRuntime.generateChatResponse, {
      agentId: elizaAgent?._id?.toString() || args.playerId,
      characterName: elizaAgent?.name || "Agent",
      characterBio: elizaAgent?.bio || "A friendly character",
      characterPersonality: elizaAgent?.personality || ["friendly", "curious"],
      conversationHistory: args.conversationHistory.map(m => ({ from: m.from, text: m.text })),
      lastMessage: { from: args.lastMessage.from, text: args.lastMessage.text },
    });
  },
});
