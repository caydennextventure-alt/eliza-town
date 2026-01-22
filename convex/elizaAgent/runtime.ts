/**
 * ElizaOS Runtime Types for Convex
 *
 * This file exports types used across the elizaAgent module.
 * The actual agent logic is in actions.ts using Convex's LLM utilities.
 */

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
// Helper: Create character from config
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
    systemPrompt: `You are ${config.name}. ${config.identity}

Your current goals: ${config.plan || "Explore and interact with others."}

Personality traits: ${config.personality.join(", ")}

You are in AI Town, a social simulation where characters move around, have conversations, and do activities. Stay in character at all times.`,
  };
}
