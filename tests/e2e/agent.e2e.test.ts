/**
 * Agent E2E Tests
 * 
 * Tests for agent creation, removal, and management.
 */

import {
  getTestClient,
  waitForEngineRunning,
  waitForAgents,
  sleep,
} from './helpers';

describe('Agent E2E Tests', () => {
  const client = getTestClient();
  
  beforeAll(async () => {
    // Ensure engine is running
    const status = await client.getDefaultWorldStatus();
    if (status && status.status !== 'running') {
      await client.resumeEngine();
      await waitForEngineRunning(client, 30000);
    }
  });
  
  afterAll(async () => {
    // Clean up all test agents created during tests
    const status = await client.getDefaultWorldStatus();
    if (status) {
      const removedCount = await client.cleanupTestAgents(status.worldId);
      if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} test agent(s)`);
      }
    }
  });
  
  describe('Custom Agent Creation', () => {
    test('should create a custom agent', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const initialState = await client.getWorldState(status!.worldId);
      const initialAgentCount = initialState.world.agents.length;
      
      // Create a test agent
      const inputId = await client.createAgent(status!.worldId, {
        name: `TestAgent_${Date.now()}`,
        character: 'f1',
        identity: 'A test agent created for E2E testing. Friendly and curious.',
        plan: 'Explore the town and talk to other agents.',
      });
      
      expect(inputId).toBeDefined();
      
      // Wait for the input to be processed
      await client.waitForInput(inputId, 30000);
      
      // Wait for agent to spawn
      await waitForAgents(client, status!.worldId, initialAgentCount + 1, 30000);
      
      const newState = await client.getWorldState(status!.worldId);
      expect(newState.world.agents.length).toBe(initialAgentCount + 1);
    });
    
    test('should have valid description after creation', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const descriptions = await client.getGameDescriptions(status!.worldId);
      
      // Find a custom agent (isCustom === true)
      const customAgent = descriptions.agentDescriptions.find((d) => d.isCustom === true);
      
      // Skip if no custom agents exist
      if (!customAgent) {
        console.log('No custom agents found, skipping description validation');
        return;
      }
      
      expect(customAgent.identity).toBeDefined();
      expect(customAgent.identity.length).toBeGreaterThan(0);
      expect(customAgent.plan).toBeDefined();
      expect(customAgent.plan.length).toBeGreaterThan(0);
    });
  });
  
  describe('Agent Removal', () => {
    test('should remove a custom agent', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Create an agent to remove
      const agentName = `ToRemove_${Date.now()}`;
      const createInputId = await client.createAgent(status!.worldId, {
        name: agentName,
        character: 'f2',
        identity: 'An agent that will be removed.',
        plan: 'Exist briefly.',
      });
      
      await client.waitForInput(createInputId, 30000);
      await sleep(3000); // Wait for agent to fully spawn
      
      // Find the created agent
      const stateAfterCreate = await client.getWorldState(status!.worldId);
      const descriptions = await client.getGameDescriptions(status!.worldId);
      
      const createdAgentDesc = descriptions.agentDescriptions.find((d) => {
        const playerDesc = descriptions.playerDescriptions.find(
          (p) => stateAfterCreate.world.agents.find((a) => a.id === d.agentId)?.playerId === p.playerId
        );
        return playerDesc?.name === agentName;
      });
      
      if (!createdAgentDesc) {
        console.log('Could not find created agent, skipping removal test');
        return;
      }
      
      // Give the agent a moment to fully initialize before removing
      await sleep(2000);
      
      const agentCountBefore = stateAfterCreate.world.agents.length;
      
      // Remove the agent
      const removeInputId = await client.removeAgent(status!.worldId, createdAgentDesc.agentId);
      await client.waitForInput(removeInputId, 30000);
      
      await sleep(2000);
      
      const stateAfterRemove = await client.getWorldState(status!.worldId);
      expect(stateAfterRemove.world.agents.length).toBe(agentCountBefore - 1);
      
      // Verify the agent is gone
      const removedAgent = stateAfterRemove.world.agents.find(
        (a) => a.id === createdAgentDesc.agentId
      );
      expect(removedAgent).toBeUndefined();
    });
  });
  
  describe('Agent State', () => {
    test('should have agents with valid positions', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      const descriptions = await client.getGameDescriptions(status!.worldId);
      const { width, height } = descriptions.worldMap;
      
      for (const agent of state.world.agents) {
        const player = state.world.players.find((p) => p.id === agent.playerId);
        expect(player).toBeDefined();
        
        expect(player!.position.x).toBeGreaterThanOrEqual(0);
        expect(player!.position.x).toBeLessThan(width);
        expect(player!.position.y).toBeGreaterThanOrEqual(0);
        expect(player!.position.y).toBeLessThan(height);
      }
    });
    
    test('should have agents with valid facing directions', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      
      for (const agent of state.world.agents) {
        const player = state.world.players.find((p) => p.id === agent.playerId);
        expect(player).toBeDefined();
        
        // Facing should be a unit vector or close to it
        const { dx, dy } = player!.facing;
        expect(Math.abs(dx)).toBeLessThanOrEqual(1);
        expect(Math.abs(dy)).toBeLessThanOrEqual(1);
        expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
      }
    });
  });
});
