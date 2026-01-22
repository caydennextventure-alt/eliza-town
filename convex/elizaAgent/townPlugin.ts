/**
 * AI Town Plugin for ElizaOS
 * 
 * This plugin provides:
 * 1. AI Town Provider - Injects game context (position, nearby agents, etc.) into ElizaOS state
 * 2. AI Town Actions - MOVE, CONVERSE, ACTIVITY, SAY, LEAVE_CONVERSATION, WANDER, IDLE
 * 
 * The Provider ensures ElizaOS has access to the game world context when making decisions.
 * The Actions are registered so ElizaOS recognizes them as valid action choices.
 * 
 * Actual action execution happens in agentOperations.ts after parsing the LLM response.
 */

import type { Action, ActionResult, Plugin, IAgentRuntime, Memory, State, HandlerCallback, Provider, ProviderResult } from "@elizaos/core";

// =============================================================================
// AI Town Context Provider
// =============================================================================

/**
 * AI Town Context - stored in runtime state to be accessed by the provider
 */
export interface AITownContext {
  characterName: string;
  position: { x: number; y: number };
  nearbyAgents: Array<{
    name: string;
    distance: number;
    activity?: string;
    isInConversation: boolean;
  }>;
  recentMessages: Array<{ from: string; text: string }>;
  currentActivity?: string;
  inConversation: boolean;
  conversationMessages?: Array<{ from: string; text: string }>;
  availableActions: string[];
  mapWidth?: number;
  mapHeight?: number;
}

// Global context storage (set before each ElizaOS call)
let currentTownContext: AITownContext | null = null;

/**
 * Set the AI Town context before making an ElizaOS call
 */
export function setTownContext(context: AITownContext): void {
  currentTownContext = context;
}

/**
 * Clear the AI Town context after an ElizaOS call
 */
export function clearTownContext(): void {
  currentTownContext = null;
}

/**
 * AI Town Provider - Injects game world context into ElizaOS
 * 
 * This provider is called by ElizaOS to get context about the current game state.
 * It formats the information for the LLM to understand the agent's situation.
 * 
 * Returns a ProviderResult with:
 * - values: Structured data for template substitution
 * - data: Raw context data for other components
 * - text: Human-readable context string
 */
const aiTownProvider: Provider = {
  name: "aitown-context",
  description: "Provides AI Town game world context including position, nearby characters, and available actions",
  
  get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<ProviderResult> => {
    if (!currentTownContext) {
      return {
        values: { location: "unknown", nearbyCount: 0 },
        data: {},
        text: "You are in AI Town. Look around and decide what to do.",
      };
    }
    
    const ctx = currentTownContext;
    const lines: string[] = [];
    
    // Current state
    lines.push(`=== AI TOWN STATUS ===`);
    lines.push(`Location: (${ctx.position.x.toFixed(0)}, ${ctx.position.y.toFixed(0)})`);
    if (ctx.currentActivity) {
      lines.push(`Currently: ${ctx.currentActivity}`);
    }
    
    // Nearby agents
    lines.push(`\n=== NEARBY CHARACTERS ===`);
    const sortedAgents = [...ctx.nearbyAgents].sort((a, b) => a.distance - b.distance);
    const availableAgents = sortedAgents.filter(a => !a.isInConversation);
    
    if (ctx.nearbyAgents.length === 0) {
      lines.push("No one nearby.");
    } else {
      sortedAgents.forEach(a => {
        const status = a.isInConversation 
          ? "(busy - in conversation)" 
          : a.activity 
            ? `(${a.activity})` 
            : "(available)";
        lines.push(`- ${a.name}: ${a.distance.toFixed(1)} tiles away ${status}`);
      });
      
      // Highlight opportunities
      if (availableAgents.length > 0 && availableAgents[0].distance < 5) {
        lines.push(`\n💬 ${availableAgents[0].name} is nearby and available to talk!`);
      }
    }
    
    // Conversation context
    if (ctx.inConversation && ctx.conversationMessages?.length) {
      lines.push(`\n=== CURRENT CONVERSATION ===`);
      ctx.conversationMessages.slice(-6).forEach(m => {
        lines.push(`${m.from}: "${m.text}"`);
      });
    } else if (ctx.recentMessages.length > 0) {
      lines.push(`\n=== OVERHEARD ===`);
      ctx.recentMessages.slice(-3).forEach(m => {
        lines.push(`${m.from}: "${m.text}"`);
      });
    }
    
    // Available actions with instructions
    lines.push(`\n=== AVAILABLE ACTIONS ===`);
    lines.push(`You can choose from: ${ctx.availableActions.join(", ")}`);
    lines.push("");
    
    // Action-specific instructions based on available actions
    if (ctx.availableActions.includes("CONVERSE")) {
      lines.push('• CONVERSE - Start talking to someone nearby. params: { "target": "CharacterName" }');
    }
    if (ctx.availableActions.includes("MOVE")) {
      lines.push('• MOVE - Walk to a specific location. params: { "x": number, "y": number }');
    }
    if (ctx.availableActions.includes("WANDER")) {
      lines.push('• WANDER - Explore and walk around. params: {}');
    }
    if (ctx.availableActions.includes("ACTIVITY")) {
      lines.push('• ACTIVITY - Do something in place. params: { "description": "what you\'re doing", "emoji": "🎯", "duration": 30 }');
    }
    if (ctx.availableActions.includes("IDLE")) {
      lines.push('• IDLE - Stay put and observe. params: {}');
    }
    if (ctx.availableActions.includes("SAY")) {
      lines.push('• SAY - Speak in conversation. params: { "text": "what to say" }');
    }
    if (ctx.availableActions.includes("LEAVE_CONVERSATION")) {
      lines.push('• LEAVE_CONVERSATION - End the conversation. params: {}');
    }
    
    // Decision prompt
    lines.push(`\n=== YOUR DECISION ===`);
    lines.push(`Respond with ONLY a JSON object:`);
    lines.push(`{ "action": "ACTION_NAME", "params": {...}, "reason": "brief reason" }`);
    
    // Return proper ProviderResult with structured data
    return {
      values: {
        characterName: ctx.characterName,
        location: `(${ctx.position.x.toFixed(0)}, ${ctx.position.y.toFixed(0)})`,
        positionX: ctx.position.x,
        positionY: ctx.position.y,
        nearbyCount: ctx.nearbyAgents.length,
        availableCount: availableAgents.length,
        closestAvailable: availableAgents[0]?.name || "no one",
        inConversation: ctx.inConversation,
        currentActivity: ctx.currentActivity || "nothing",
        availableActions: ctx.availableActions.join(", "),
      },
      data: {
        context: ctx,
        nearbyAgents: sortedAgents,
        availableAgents,
      },
      text: lines.join("\n"),
    };
  },
};

// =============================================================================
// AI Town Action Definitions
// =============================================================================

const moveAction: Action = {
  name: "MOVE",
  description: "Move to a specific location in the town",
  similes: ["GO", "WALK", "TRAVEL", "GO_TO", "WALK_TO", "move", "Move", "go", "walk", "travel", "GOTO", "WALKTO", "RUN", "run", "NAVIGATE", "navigate"],
  examples: [
    [
      {
        name: "{{agentName}}",
        content: { text: "I should go check out the garden." },
      },
      {
        name: "{{agentName}}",
        content: { text: '{"action": "MOVE", "params": {"x": 15, "y": 20}, "reason": "Going to the garden"}', actions: ["MOVE"] },
      },
    ],
  ],
  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    return true;
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<ActionResult | undefined> => {
    // Pass-through action - actual movement is handled by agentOperations.ts
    if (callback) {
      await callback({ text: message.content?.text || "", actions: ["MOVE"] });
    }
    return { success: true };
  },
};

const converseAction: Action = {
  name: "CONVERSE",
  description: "Start a conversation with a nearby character",
  similes: ["TALK", "CHAT", "SPEAK", "TALK_TO", "CHAT_WITH", "START_CONVERSATION", "converse", "Converse", "talk", "chat", "speak", "TALKTO", "CHATWITH", "STARTCONVERSATION", "CONVERSATION", "conversation", "GREET", "greet", "APPROACH", "approach"],
  examples: [
    [
      {
        name: "{{agentName}}",
        content: { text: "I'd like to talk to Alice." },
      },
      {
        name: "{{agentName}}",
        content: { text: '{"action": "CONVERSE", "params": {"target": "Alice"}, "reason": "Want to chat"}', actions: ["CONVERSE"] },
      },
    ],
  ],
  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    return true;
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<ActionResult | undefined> => {
    if (callback) {
      await callback({ text: message.content?.text || "", actions: ["CONVERSE"] });
    }
    return { success: true };
  },
};

const activityAction: Action = {
  name: "ACTIVITY",
  description: "Perform an activity in place (thinking, reading, etc.)",
  similes: ["DO", "PERFORM", "START_ACTIVITY", "DO_ACTIVITY", "activity", "Activity", "do", "perform", "ACT", "act", "ACTION", "action", "DOACTIVITY", "STARTACTIVITY", "THINK", "think", "READ", "read", "WORK", "work"],
  examples: [
    [
      {
        name: "{{agentName}}",
        content: { text: "I want to sit and think for a while." },
      },
      {
        name: "{{agentName}}",
        content: { text: '{"action": "ACTIVITY", "params": {"description": "Thinking deeply", "emoji": "🤔", "duration": 30}, "reason": "Need to reflect"}', actions: ["ACTIVITY"] },
      },
    ],
  ],
  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    return true;
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<ActionResult | undefined> => {
    if (callback) {
      await callback({ text: message.content?.text || "", actions: ["ACTIVITY"] });
    }
    return { success: true };
  },
};

const sayAction: Action = {
  name: "SAY",
  description: "Say something in a conversation",
  similes: ["SPEAK", "REPLY", "RESPOND", "TALK", "say", "Say", "speak", "reply", "respond", "talk", "MESSAGE", "message", "TELL", "tell", "COMMUNICATE", "communicate"],
  examples: [
    [
      {
        name: "{{agentName}}",
        content: { text: "Hello there!" },
      },
      {
        name: "{{agentName}}",
        content: { text: '{"action": "SAY", "params": {"text": "Hello! How are you today?"}, "reason": "Greeting"}', actions: ["SAY"] },
      },
    ],
  ],
  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    return true;
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<ActionResult | undefined> => {
    if (callback) {
      await callback({ text: message.content?.text || "", actions: ["SAY"] });
    }
    return { success: true };
  },
};

const leaveConversationAction: Action = {
  name: "LEAVE_CONVERSATION",
  description: "Leave the current conversation",
  similes: ["EXIT", "LEAVE", "END_CONVERSATION", "GOODBYE", "BYE", "leave_conversation", "LeaveConversation", "LEAVECONVERSATION", "leaveconversation", "exit", "leave", "END", "end", "ENDCONVERSATION", "STOP", "stop", "QUIT", "quit", "DEPART", "depart"],
  examples: [
    [
      {
        name: "{{agentName}}",
        content: { text: "I should get going." },
      },
      {
        name: "{{agentName}}",
        content: { text: '{"action": "LEAVE_CONVERSATION", "params": {}, "reason": "Time to go"}', actions: ["LEAVE_CONVERSATION"] },
      },
    ],
  ],
  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    return true;
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<ActionResult | undefined> => {
    if (callback) {
      await callback({ text: message.content?.text || "", actions: ["LEAVE_CONVERSATION"] });
    }
    return { success: true };
  },
};

const wanderAction: Action = {
  name: "WANDER",
  description: "Wander around aimlessly exploring the town",
  similes: ["EXPLORE", "ROAM", "STROLL", "WALK_AROUND", "wander", "Wander", "explore", "roam", "stroll", "WALKAROUND", "MEANDER", "meander", "DRIFT", "drift", "PATROL", "patrol"],
  examples: [
    [
      {
        name: "{{agentName}}",
        content: { text: "I feel like exploring." },
      },
      {
        name: "{{agentName}}",
        content: { text: '{"action": "WANDER", "params": {}, "reason": "Exploring the town"}', actions: ["WANDER"] },
      },
    ],
  ],
  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    return true;
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<ActionResult | undefined> => {
    if (callback) {
      await callback({ text: message.content?.text || "", actions: ["WANDER"] });
    }
    return { success: true };
  },
};

const idleAction: Action = {
  name: "IDLE",
  description: "Stay idle and observe surroundings",
  similes: ["WAIT", "STAY", "OBSERVE", "REST", "DO_NOTHING", "idle", "Idle", "wait", "stay", "observe", "rest", "DONOTHING", "NOTHING", "nothing", "PAUSE", "pause", "STAND", "stand", "RELAX", "relax"],
  examples: [
    [
      {
        name: "{{agentName}}",
        content: { text: "I'll just stay here for now." },
      },
      {
        name: "{{agentName}}",
        content: { text: '{"action": "IDLE", "params": {}, "reason": "Observing the surroundings"}', actions: ["IDLE"] },
      },
    ],
  ],
  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    return true;
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<ActionResult | undefined> => {
    if (callback) {
      await callback({ text: message.content?.text || "", actions: ["IDLE"] });
    }
    return { success: true };
  },
};

// =============================================================================
// AI Town Plugin Export
// =============================================================================

export const townPlugin: Plugin = {
  name: "aitown",
  description: "AI Town plugin - provides context via Provider and registers MOVE, CONVERSE, ACTIVITY, SAY, LEAVE_CONVERSATION, WANDER, IDLE actions",
  actions: [
    moveAction,
    converseAction,
    activityAction,
    sayAction,
    leaveConversationAction,
    wanderAction,
    idleAction,
  ],
  evaluators: [],
  providers: [aiTownProvider], // Provider injects game context into ElizaOS
  services: [],
};

export default townPlugin;
