/**
 * ElizaOS Runtime Types for Convex
 *
 * This file now just exports types used by actions.ts.
 * The actual ElizaOS runtime is initialized in actions.ts using @elizaos/core.
 */

// Re-export types from actions for backward compatibility
export type {
  ElizaCharacter,
  AgentContext,
  NearbyAgent,
  ChatMessage,
  ConversationContext,
  AgentDecision,
} from "./actions";

export { createCharacterFromConfig } from "./actions";
