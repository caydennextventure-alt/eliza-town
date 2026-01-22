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
