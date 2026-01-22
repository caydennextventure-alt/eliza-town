/**
 * AI Town Plugin for ElizaOS
 * 
 * This plugin registers AI Town-specific actions (MOVE, CONVERSE, ACTIVITY, etc.)
 * with ElizaOS so they are recognized as valid actions and don't cause
 * "Action not found" errors.
 * 
 * These actions are pass-through - the actual handling happens in agentOperations.ts
 * after parsing the LLM response.
 */

import type { Action, ActionResult, Plugin, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";

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
  description: "AI Town actions plugin - registers MOVE, CONVERSE, ACTIVITY, SAY, LEAVE_CONVERSATION, WANDER, IDLE",
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
  providers: [],
  services: [],
};

export default townPlugin;
