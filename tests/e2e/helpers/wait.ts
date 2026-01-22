/**
 * Wait/Poll Helpers for E2E Tests
 * 
 * Utilities for waiting on asynchronous game state changes.
 */

import { TestClient, WorldId, Conversation } from './client';

export interface WaitOptions {
  /** Maximum time to wait in milliseconds */
  timeout: number;
  /** Polling interval in milliseconds */
  interval: number;
  /** Description for error messages */
  description: string;
}

const DEFAULT_OPTIONS: WaitOptions = {
  timeout: 60000,
  interval: 2000,
  description: 'condition',
};

/**
 * Wait for a condition to become true, polling periodically.
 */
export async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  options: Partial<WaitOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let lastResult: T | undefined;
  let lastError: Error | undefined;
  
  while (Date.now() - startTime < opts.timeout) {
    try {
      lastResult = await fn();
      if (predicate(lastResult)) {
        return lastResult;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    
    await new Promise((resolve) => setTimeout(resolve, opts.interval));
  }
  
  const elapsed = Date.now() - startTime;
  throw new Error(
    `Timeout waiting for ${opts.description} after ${elapsed}ms. ` +
    (lastError ? `Last error: ${lastError.message}` : `Last result: ${JSON.stringify(lastResult)}`)
  );
}

/**
 * Wait for agents to spawn in the world.
 */
export async function waitForAgents(
  client: TestClient,
  worldId: WorldId,
  minCount: number,
  timeoutMs = 60000,
): Promise<void> {
  await waitFor(
    () => client.getWorldState(worldId),
    (state) => state.world.agents.length >= minCount,
    {
      timeout: timeoutMs,
      interval: 2000,
      description: `at least ${minCount} agents to spawn`,
    },
  );
}

/**
 * Wait for a conversation to start between any agents.
 */
export async function waitForConversation(
  client: TestClient,
  worldId: WorldId,
  timeoutMs = 120000,
): Promise<Conversation> {
  const state = await waitFor(
    () => client.getWorldState(worldId),
    (state) => state.world.conversations.length > 0,
    {
      timeout: timeoutMs,
      interval: 3000,
      description: 'conversation to start',
    },
  );
  
  return state.world.conversations[0];
}

/**
 * Wait for messages in a conversation.
 */
export async function waitForMessages(
  client: TestClient,
  worldId: WorldId,
  conversationId: string,
  minCount: number,
  timeoutMs = 180000,
): Promise<Array<{ author: string; authorName: string; text: string }>> {
  const messages = await waitFor(
    () => client.listMessages(worldId, conversationId),
    (msgs) => msgs.length >= minCount,
    {
      timeout: timeoutMs,
      interval: 5000,
      description: `at least ${minCount} messages in conversation`,
    },
  );
  
  return messages.map(m => ({ author: m.author, authorName: m.authorName, text: m.text }));
}

/**
 * Wait for an agent to move (position change).
 */
export async function waitForMovement(
  client: TestClient,
  worldId: WorldId,
  playerId: string,
  timeoutMs = 30000,
): Promise<{ x: number; y: number }> {
  const initialState = await client.getWorldState(worldId);
  const initialPlayer = initialState.world.players.find((p) => p.id === playerId);
  
  if (!initialPlayer) {
    throw new Error(`Player ${playerId} not found`);
  }
  
  const initialPos = { x: initialPlayer.position.x, y: initialPlayer.position.y };
  
  const state = await waitFor(
    () => client.getWorldState(worldId),
    (state) => {
      const player = state.world.players.find((p) => p.id === playerId);
      if (!player) return false;
      return player.position.x !== initialPos.x || player.position.y !== initialPos.y;
    },
    {
      timeout: timeoutMs,
      interval: 1000,
      description: `player ${playerId} to move`,
    },
  );
  
  const player = state.world.players.find((p) => p.id === playerId)!;
  return player.position;
}

/**
 * Wait for the engine to be running.
 */
export async function waitForEngineRunning(
  client: TestClient,
  timeoutMs = 30000,
): Promise<WorldId> {
  const status = await waitFor(
    () => client.getDefaultWorldStatus(),
    (status) => status !== null && status.status === 'running',
    {
      timeout: timeoutMs,
      interval: 1000,
      description: 'engine to be running',
    },
  );
  
  if (!status) {
    throw new Error('No world status found');
  }
  
  return status.worldId;
}

/**
 * Wait for an agent operation to complete.
 */
export async function waitForAgentIdle(
  client: TestClient,
  worldId: WorldId,
  agentId: string,
  timeoutMs = 60000,
): Promise<void> {
  await waitFor(
    () => client.getWorldState(worldId),
    (state) => {
      const agent = state.world.agents.find((a) => a.id === agentId);
      return agent !== undefined && !agent.inProgressOperation;
    },
    {
      timeout: timeoutMs,
      interval: 2000,
      description: `agent ${agentId} to be idle`,
    },
  );
}

/**
 * Sleep for a specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
