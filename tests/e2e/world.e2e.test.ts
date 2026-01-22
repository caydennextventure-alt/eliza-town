/**
 * World E2E Tests
 * 
 * Tests for world initialization, engine control, and basic state.
 */

import {
  getTestClient,
  waitForEngineRunning,
  waitForAgents,
  assertEngineState,
  assertPlayersInBounds,
  assertAgentDescriptions,
  sleep,
} from './helpers';

describe('World E2E Tests', () => {
  const client = getTestClient();
  
  describe('World Initialization', () => {
    test('should have a default world', async () => {
      const status = await client.getDefaultWorldStatus();
      
      expect(status).not.toBeNull();
      expect(status!.worldId).toBeDefined();
      expect(status!.engineId).toBeDefined();
      expect(status!.isDefault).toBe(true);
    });
    
    test('should have valid world state', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      
      expect(state.world).toBeDefined();
      expect(state.engine).toBeDefined();
      expect(Array.isArray(state.world.players)).toBe(true);
      expect(Array.isArray(state.world.agents)).toBe(true);
      expect(Array.isArray(state.world.conversations)).toBe(true);
      expect(typeof state.world.nextId).toBe('number');
    });
    
    test('should have valid map and descriptions', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const descriptions = await client.getGameDescriptions(status!.worldId);
      
      expect(descriptions.worldMap).toBeDefined();
      expect(descriptions.worldMap.width).toBeGreaterThan(0);
      expect(descriptions.worldMap.height).toBeGreaterThan(0);
      expect(Array.isArray(descriptions.playerDescriptions)).toBe(true);
      expect(Array.isArray(descriptions.agentDescriptions)).toBe(true);
    });
  });
  
  describe('Engine Control', () => {
    test('should be able to stop the engine', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Only try to stop if running
      if (status!.status === 'running') {
        await client.stopEngine();
        
        // Wait a bit for the engine to stop
        await sleep(2000);
        
        const newStatus = await client.getDefaultWorldStatus();
        expect(newStatus!.status).toBe('stoppedByDeveloper');
      }
    });
    
    test('should be able to resume the engine', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Only try to resume if stopped
      if (status!.status !== 'running') {
        await client.resumeEngine();
        
        // Wait for engine to start
        const worldId = await waitForEngineRunning(client, 30000);
        expect(worldId).toBe(status!.worldId);
      }
      
      const newStatus = await client.getDefaultWorldStatus();
      expect(newStatus!.status).toBe('running');
    });
    
    test('should have running engine after resume', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Ensure engine is running
      if (status!.status !== 'running') {
        await client.resumeEngine();
        await waitForEngineRunning(client, 30000);
      }
      
      await assertEngineState(client, status!.worldId, { running: true });
    });
  });
  
  describe('Agent Spawning', () => {
    beforeAll(async () => {
      // Ensure engine is running
      const status = await client.getDefaultWorldStatus();
      if (status && status.status !== 'running') {
        await client.resumeEngine();
        await waitForEngineRunning(client, 30000);
      }
    });
    
    test('should have agents after initialization', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // If no agents, initialize
      const state = await client.getWorldState(status!.worldId);
      if (state.world.agents.length === 0) {
        await client.initialize(3);
        await waitForAgents(client, status!.worldId, 3, 60000);
      }
      
      const newState = await client.getWorldState(status!.worldId);
      expect(newState.world.agents.length).toBeGreaterThan(0);
    });
    
    test('should have matching players for agents', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      
      for (const agent of state.world.agents) {
        const player = state.world.players.find((p) => p.id === agent.playerId);
        expect(player).toBeDefined();
        expect(player!.id).toBe(agent.playerId);
      }
    });
    
    test('should have valid agent descriptions', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      await assertAgentDescriptions(client, status!.worldId);
    });
    
    test('should have players within map bounds', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      await assertPlayersInBounds(client, status!.worldId);
    });
  });
});
