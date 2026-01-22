/**
 * Convex HTTP Client for E2E Tests
 * 
 * Provides a typed client for interacting with the Convex backend
 * without requiring React or browser environment.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';

// Use string types for IDs to avoid import issues
export type WorldId = string;
export type EngineId = string;
export type InputId = string;

// Flexible type definitions that match Convex responses
export interface WorldStatus {
  _id: string;
  worldId: WorldId;
  engineId: EngineId;
  status: 'running' | 'stoppedByDeveloper' | 'inactive';
  isDefault: boolean;
  lastViewed: number;
}

export interface Player {
  id: string;
  human?: string;
  position: { x: number; y: number };
  facing: { dx: number; dy: number };
  speed: number;
  pathfinding?: unknown;
  activity?: { description: string; emoji?: string; until: number };
  lastInput: number;
}

export interface Agent {
  id: string;
  playerId: string;
  inProgressOperation?: { name: string; operationId: string; started: number };
  lastConversation?: number;
  lastInviteAttempt?: number;
  toRemember?: string;
}

export interface Conversation {
  id: string;
  creator: string;
  created: number;
  isTyping?: { playerId: string; messageUuid: string; since: number };
  lastMessage?: { author: string; timestamp: number };
  numMessages: number;
  participants: Array<{
    playerId: string;
    invited: number;
    status: { kind: 'invited' | 'walkingOver' | 'participating'; started?: number };
  }>;
}

export interface WorldState {
  world: {
    players: Player[];
    agents: Agent[];
    conversations: Conversation[];
    nextId: number;
  };
  engine: {
    _id: EngineId;
    currentTime?: number;
    generationNumber: number;
    running: boolean;
  };
}

export interface GameDescriptions {
  worldMap: {
    width: number;
    height: number;
    tileSetUrl: string;
  };
  playerDescriptions: Array<{
    playerId: string;
    name: string;
    description: string;
    character: string;
  }>;
  agentDescriptions: Array<{
    agentId: string;
    identity: string;
    plan: string;
    isCustom?: boolean;
    ownerId?: string;
  }>;
}

export interface Message {
  _id: string;
  author: string;
  authorName: string;
  text: string;
  conversationId: string;
  messageUuid: string;
}

export interface TestClient {
  client: ConvexHttpClient;
  
  // World operations
  getDefaultWorldStatus(): Promise<WorldStatus | null>;
  getWorldState(worldId: WorldId): Promise<WorldState>;
  getGameDescriptions(worldId: WorldId): Promise<GameDescriptions>;
  listMessages(worldId: WorldId, conversationId: string): Promise<Message[]>;
  
  // Engine control
  stopEngine(): Promise<void>;
  resumeEngine(): Promise<void>;
  
  // Agent operations
  createAgent(worldId: WorldId, params: {
    name: string;
    character: string;
    identity: string;
    plan: string;
  }): Promise<InputId>;
  
  removeAgent(worldId: WorldId, agentId: string): Promise<InputId>;
  
  // Player operations
  joinWorld(worldId: WorldId, character?: string): Promise<InputId>;
  leaveWorld(worldId: WorldId): Promise<InputId>;
  
  // Input operations
  sendInput(worldId: WorldId, name: string, args: Record<string, unknown>): Promise<InputId>;
  waitForInput(inputId: InputId, timeoutMs?: number): Promise<unknown>;
  
  // Initialize
  initialize(numAgents?: number): Promise<void>;
  
  // Cleanup operations
  cleanupTestAgents(worldId: WorldId): Promise<number>;
}

/**
 * Create a test client connected to the Convex backend
 */
export function createTestClient(convexUrl?: string): TestClient {
  const url = convexUrl || process.env.CONVEX_URL;
  if (!url) {
    throw new Error('CONVEX_URL environment variable is required');
  }
  
  const client = new ConvexHttpClient(url);
  
  return {
    client,
    
    async getDefaultWorldStatus(): Promise<WorldStatus | null> {
      const result = await client.query(api.world.defaultWorldStatus, {});
      return result as WorldStatus | null;
    },
    
    async getWorldState(worldId: WorldId): Promise<WorldState> {
      const result = await client.query(api.world.worldState, { worldId: worldId as never });
      return result as unknown as WorldState;
    },
    
    async getGameDescriptions(worldId: WorldId): Promise<GameDescriptions> {
      const result = await client.query(api.world.gameDescriptions, { worldId: worldId as never });
      return result as unknown as GameDescriptions;
    },
    
    async listMessages(worldId: WorldId, conversationId: string): Promise<Message[]> {
      const result = await client.query(api.messages.listMessages, { 
        worldId: worldId as never, 
        conversationId 
      });
      return result as unknown as Message[];
    },
    
    async stopEngine(): Promise<void> {
      await client.mutation(api.testing.stop, {});
    },
    
    async resumeEngine(): Promise<void> {
      await client.mutation(api.testing.resume, {});
    },
    
    async createAgent(worldId: WorldId, params: {
      name: string;
      character: string;
      identity: string;
      plan: string;
    }): Promise<InputId> {
      const result = await client.mutation(api.world.createAgent, {
        worldId: worldId as never,
        ...params,
      });
      return result as unknown as InputId;
    },
    
    async removeAgent(worldId: WorldId, agentId: string): Promise<InputId> {
      const result = await client.mutation(api.world.removeAgent, {
        worldId: worldId as never,
        agentId,
      });
      return result as unknown as InputId;
    },
    
    async joinWorld(worldId: WorldId, character?: string): Promise<InputId> {
      const result = await client.mutation(api.world.joinWorld, {
        worldId: worldId as never,
        character,
      });
      return result as unknown as InputId;
    },
    
    async leaveWorld(worldId: WorldId): Promise<InputId> {
      const result = await client.mutation(api.world.leaveWorld, {
        worldId: worldId as never,
      });
      return result as unknown as InputId;
    },
    
    async sendInput(worldId: WorldId, name: string, args: Record<string, unknown>): Promise<InputId> {
      const result = await client.mutation(api.aiTown.main.sendInput, {
        worldId: worldId as never,
        name,
        args,
      });
      return result as unknown as InputId;
    },
    
    async waitForInput(inputId: InputId, timeoutMs = 30000): Promise<unknown> {
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeoutMs) {
        const result = await client.query(api.aiTown.main.inputStatus, { 
          inputId: inputId as never 
        });
        
        if (result !== null) {
          const typed = result as { kind: string; message?: string; value?: unknown };
          if (typed.kind === 'error') {
            throw new Error(`Input failed: ${typed.message}`);
          }
          return typed.value;
        }
        
        // Poll every 500ms
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      
      throw new Error(`Timed out waiting for input ${inputId} after ${timeoutMs}ms`);
    },
    
    async initialize(numAgents?: number): Promise<void> {
      // The init module exports a default mutation
      await client.mutation(api.init.default, { numAgents });
    },
    
    async cleanupTestAgents(worldId: WorldId): Promise<number> {
      // Pattern to match test agent names
      const testAgentPatterns = [
        /^TestAgent_\d+$/,
        /^ToRemove_\d+$/,
        /^E2EAgent_/,
        /^Test_/,
      ];
      
      const state = await this.getWorldState(worldId);
      const descriptions = await this.getGameDescriptions(worldId);
      
      let removedCount = 0;
      
      for (const agent of state.world.agents) {
        // Find the agent description to get associated player name
        const agentDesc = descriptions.agentDescriptions.find(d => d.agentId === agent.id);
        if (!agentDesc) continue;
        
        // Find the player to get the name
        const player = state.world.players.find(p => p.id === agent.playerId);
        if (!player) continue;
        
        const playerDesc = descriptions.playerDescriptions.find(d => d.playerId === player.id);
        if (!playerDesc) continue;
        
        // Check if this is a test agent by name pattern or isCustom flag
        const isTestAgent = testAgentPatterns.some(pattern => pattern.test(playerDesc.name));
        
        if (isTestAgent || agentDesc.isCustom) {
          try {
            console.log(`Cleaning up test agent: ${playerDesc.name} (${agent.id})`);
            const inputId = await this.removeAgent(worldId, agent.id);
            await this.waitForInput(inputId, 30000);
            removedCount++;
            // Small delay between removals to avoid overwhelming the engine
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.error(`Failed to remove agent ${playerDesc.name}:`, error);
          }
        }
      }
      
      return removedCount;
    },
  };
}

// Export singleton for convenience
let _defaultClient: TestClient | null = null;

export function getTestClient(): TestClient {
  if (!_defaultClient) {
    _defaultClient = createTestClient();
  }
  return _defaultClient;
}

export function resetTestClient(): void {
  _defaultClient = null;
}
