/**
 * Custom Assertions for E2E Tests
 * 
 * Domain-specific assertions for AI Town game state.
 */

import { TestClient, WorldId, WorldState } from './client';

export interface WorldStateSnapshot {
  playerCount: number;
  agentCount: number;
  conversationCount: number;
  positions: Array<{ playerId: string; x: number; y: number }>;
  timestamp: number;
}

/**
 * Capture a snapshot of the world state for comparison.
 */
export async function captureWorldSnapshot(
  client: TestClient,
  worldId: WorldId,
): Promise<WorldStateSnapshot> {
  const state = await client.getWorldState(worldId);
  
  return {
    playerCount: state.world.players.length,
    agentCount: state.world.agents.length,
    conversationCount: state.world.conversations.length,
    positions: state.world.players.map((p) => ({
      playerId: p.id,
      x: p.position.x,
      y: p.position.y,
    })),
    timestamp: Date.now(),
  };
}

/**
 * Assert that players have moved since the initial snapshot.
 */
export function assertPlayersHaveMoved(
  initial: WorldStateSnapshot,
  current: WorldStateSnapshot,
): void {
  let movedCount = 0;
  
  for (const currentPos of current.positions) {
    const initialPos = initial.positions.find((p) => p.playerId === currentPos.playerId);
    if (initialPos) {
      if (currentPos.x !== initialPos.x || currentPos.y !== initialPos.y) {
        movedCount++;
      }
    }
  }
  
  if (movedCount === 0) {
    throw new Error('Expected at least one player to have moved, but none did');
  }
}

/**
 * Assert that a conversation has valid participants.
 */
export async function assertValidConversation(
  client: TestClient,
  worldId: WorldId,
  conversationId: string,
): Promise<void> {
  const state = await client.getWorldState(worldId);
  const conversation = state.world.conversations.find((c) => c.id === conversationId);
  
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }
  
  if (conversation.participants.length !== 2) {
    throw new Error(
      `Expected conversation to have 2 participants, got ${conversation.participants.length}`,
    );
  }
  
  // Verify participants exist as players
  for (const participant of conversation.participants) {
    const player = state.world.players.find((p) => p.id === participant.playerId);
    if (!player) {
      throw new Error(`Participant ${participant.playerId} not found as player`);
    }
  }
}

/**
 * Assert that messages are valid and non-empty.
 */
export function assertValidMessages(
  messages: Array<{ text: string; author: string; authorName: string }>,
  minCount: number,
): void {
  if (messages.length < minCount) {
    throw new Error(`Expected at least ${minCount} messages, got ${messages.length}`);
  }
  
  for (const message of messages) {
    if (!message.text || message.text.trim().length === 0) {
      throw new Error(`Message from ${message.authorName} has empty text`);
    }
    
    if (!message.author) {
      throw new Error('Message has no author');
    }
  }
}

/**
 * Assert that agents have valid descriptions.
 */
export async function assertAgentDescriptions(
  client: TestClient,
  worldId: WorldId,
): Promise<void> {
  const state = await client.getWorldState(worldId);
  const descriptions = await client.getGameDescriptions(worldId);
  
  for (const agent of state.world.agents) {
    const desc = descriptions.agentDescriptions.find((d) => d.agentId === agent.id);
    if (!desc) {
      throw new Error(`Agent ${agent.id} has no description`);
    }
    
    if (!desc.identity || desc.identity.trim().length === 0) {
      throw new Error(`Agent ${agent.id} has empty identity`);
    }
    
    if (!desc.plan || desc.plan.trim().length === 0) {
      throw new Error(`Agent ${agent.id} has empty plan`);
    }
  }
  
  for (const player of state.world.players) {
    const desc = descriptions.playerDescriptions.find((d) => d.playerId === player.id);
    if (!desc) {
      throw new Error(`Player ${player.id} has no description`);
    }
    
    if (!desc.name || desc.name.trim().length === 0) {
      throw new Error(`Player ${player.id} has empty name`);
    }
  }
}

/**
 * Assert the engine is in expected state.
 */
export async function assertEngineState(
  client: TestClient,
  worldId: WorldId,
  expected: { running: boolean },
): Promise<void> {
  const state = await client.getWorldState(worldId);
  
  if (state.engine.running !== expected.running) {
    throw new Error(
      `Expected engine.running to be ${expected.running}, got ${state.engine.running}`,
    );
  }
}

/**
 * Assert player position is within map bounds.
 */
export async function assertPlayersInBounds(
  client: TestClient,
  worldId: WorldId,
): Promise<void> {
  const state = await client.getWorldState(worldId);
  const descriptions = await client.getGameDescriptions(worldId);
  const { width, height } = descriptions.worldMap;
  
  for (const player of state.world.players) {
    const { x, y } = player.position;
    
    if (x < 0 || x >= width || y < 0 || y >= height) {
      throw new Error(
        `Player ${player.id} is out of bounds at (${x}, ${y}). Map is ${width}x${height}`,
      );
    }
  }
}
