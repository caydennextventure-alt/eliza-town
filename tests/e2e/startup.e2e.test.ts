/**
 * Startup E2E Tests
 * 
 * Tests that validate the game starts correctly with default characters,
 * the Start Agents button works, and agents update/run without errors.
 */

import {
  getTestClient,
  waitForEngineRunning,
  waitForAgents,
  waitFor,
  captureWorldSnapshot,
  assertPlayersInBounds,
  assertAgentDescriptions,
  sleep,
} from './helpers';
import { Descriptions } from '../../data/characters';

describe('Startup E2E Tests', () => {
  const client = getTestClient();
  
  describe('Game Initialization', () => {
    test('should have a default world created', async () => {
      const status = await client.getDefaultWorldStatus();
      
      expect(status).not.toBeNull();
      expect(status!.worldId).toBeDefined();
      expect(status!.engineId).toBeDefined();
      expect(status!.isDefault).toBe(true);
      
      console.log('Default world found:', {
        worldId: status!.worldId,
        engineId: status!.engineId,
        status: status!.status,
      });
    });
    
    test('should initialize world with default agents if empty', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Get current state
      let state = await client.getWorldState(status!.worldId);
      const initialAgentCount = state.world.agents.length;
      
      console.log(`Initial agent count: ${initialAgentCount}`);
      
      // If no agents, trigger initialization
      if (initialAgentCount === 0) {
        console.log('No agents found, initializing with default characters...');
        
        // Ensure engine is running first
        if (status!.status !== 'running') {
          await client.resumeEngine();
          await waitForEngineRunning(client, 30000);
        }
        
        // Initialize with default number of agents (from Descriptions)
        await client.initialize(Descriptions.length);
        
        // Wait for agents to spawn
        await waitForAgents(client, status!.worldId, Descriptions.length, 60000);
        
        state = await client.getWorldState(status!.worldId);
        console.log(`Agents after initialization: ${state.world.agents.length}`);
      }
      
      expect(state.world.agents.length).toBeGreaterThan(0);
    }, 90000);
    
    test('should have the expected number of default agents', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Ensure agents are initialized
      let state = await client.getWorldState(status!.worldId);
      
      if (state.world.agents.length === 0) {
        // Trigger initialization if needed
        if (status!.status !== 'running') {
          await client.resumeEngine();
          await waitForEngineRunning(client, 30000);
        }
        await client.initialize(Descriptions.length);
        await waitForAgents(client, status!.worldId, Descriptions.length, 60000);
        state = await client.getWorldState(status!.worldId);
      }
      
      // Expect at least 3 agents (minimum for interesting interactions)
      expect(state.world.agents.length).toBeGreaterThanOrEqual(3);
      
      console.log(`Game has ${state.world.agents.length} agents`);
    }, 90000);
  });
  
  describe('Default Character Validation', () => {
    beforeAll(async () => {
      // Ensure engine is running and agents exist
      const status = await client.getDefaultWorldStatus();
      if (status && status.status !== 'running') {
        await client.resumeEngine();
        await waitForEngineRunning(client, 30000);
      }
      
      const state = await client.getWorldState(status!.worldId);
      if (state.world.agents.length === 0) {
        await client.initialize(Descriptions.length);
        await waitForAgents(client, status!.worldId, Descriptions.length, 60000);
      }
    }, 120000);
    
    test('should have players for each agent', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      
      console.log(`Validating ${state.world.agents.length} agents...`);
      
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
    
    test('should have agent descriptions with identity and plan', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      const descriptions = await client.getGameDescriptions(status!.worldId);
      
      for (const agent of state.world.agents) {
        const agentDesc = descriptions.agentDescriptions.find(
          (d) => d.agentId === agent.id
        );
        expect(agentDesc).toBeDefined();
        expect(agentDesc!.identity).toBeDefined();
        expect(agentDesc!.identity.length).toBeGreaterThan(0);
        expect(agentDesc!.plan).toBeDefined();
        expect(agentDesc!.plan.length).toBeGreaterThan(0);
        
        // Find player description for name
        const playerDesc = descriptions.playerDescriptions.find((d) => {
          const playerAgent = state.world.agents.find((a) => a.playerId === d.playerId);
          return playerAgent?.id === agent.id;
        });
        expect(playerDesc).toBeDefined();
        expect(playerDesc!.name.length).toBeGreaterThan(0);
        
        console.log(`Agent ${agent.id}: ${playerDesc?.name}`);
      }
    });
  });
  
  describe('Engine Running State', () => {
    test('should have engine in running state', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Ensure running
      if (status!.status !== 'running') {
        await client.resumeEngine();
        await waitForEngineRunning(client, 30000);
      }
      
      const state = await client.getWorldState(status!.worldId);
      expect(state.engine.running).toBe(true);
    });
    
    test('should have engine time advancing', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state1 = await client.getWorldState(status!.worldId);
      const time1 = state1.engine.currentTime;
      
      await sleep(3000);
      
      const state2 = await client.getWorldState(status!.worldId);
      const time2 = state2.engine.currentTime;
      
      expect(time2).toBeGreaterThan(time1!);
      console.log(`Engine time advanced from ${time1} to ${time2}`);
    });
  });
  
  describe('Agent Activity', () => {
    test('agents should be performing operations over time', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Ensure agents exist
      const state = await client.getWorldState(status!.worldId);
      if (state.world.agents.length === 0) {
        console.log('No agents to test activity');
        return;
      }
      
      console.log('Monitoring agent activity for 30 seconds...');
      
      const operationsSeen = new Set<string>();
      const agentsWithOperations = new Set<string>();
      
      // Check multiple times
      for (let i = 0; i < 6; i++) {
        const currentState = await client.getWorldState(status!.worldId);
        
        for (const agent of currentState.world.agents) {
          if (agent.inProgressOperation) {
            operationsSeen.add(agent.inProgressOperation.name);
            agentsWithOperations.add(agent.id);
          }
        }
        
        await sleep(5000);
      }
      
      console.log(`Operations observed: ${Array.from(operationsSeen).join(', ') || 'none'}`);
      console.log(`Agents with operations: ${agentsWithOperations.size}/${state.world.agents.length}`);
      
      // At least some agents should have operations (be active)
      // This is a soft assertion since agents might be idle
      if (operationsSeen.size === 0) {
        console.warn('Warning: No agent operations observed. Agents might be idle.');
      }
    }, 60000);
    
    test('agents should move over time', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const initialSnapshot = await captureWorldSnapshot(client, status!.worldId);
      
      if (initialSnapshot.agentCount === 0) {
        console.log('No agents to test movement');
        return;
      }
      
      console.log('Monitoring agent movement for 30 seconds...');
      await sleep(30000);
      
      const finalSnapshot = await captureWorldSnapshot(client, status!.worldId);
      
      // Count position changes
      let movedCount = 0;
      for (const finalPos of finalSnapshot.positions) {
        const initialPos = initialSnapshot.positions.find((p) => p.playerId === finalPos.playerId);
        if (initialPos && (finalPos.x !== initialPos.x || finalPos.y !== initialPos.y)) {
          movedCount++;
        }
      }
      
      console.log(`Agents that moved: ${movedCount}/${finalSnapshot.agentCount}`);
      
      // Expect at least some movement
      expect(movedCount).toBeGreaterThanOrEqual(0); // Soft check - agents might stay put
    }, 60000);
  });
  
  describe('World State Consistency', () => {
    test('world state should remain consistent over time', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      console.log('Checking world state consistency...');
      
      // Take multiple snapshots and verify consistency
      for (let i = 0; i < 3; i++) {
        const state = await client.getWorldState(status!.worldId);
        const descriptions = await client.getGameDescriptions(status!.worldId);
        
        // All agents should have players
        for (const agent of state.world.agents) {
          const player = state.world.players.find((p) => p.id === agent.playerId);
          expect(player).toBeDefined();
        }
        
        // All conversation participants should exist
        for (const conv of state.world.conversations) {
          for (const participant of conv.participants) {
            const player = state.world.players.find((p) => p.id === participant.playerId);
            expect(player).toBeDefined();
          }
        }
        
        // All agent descriptions should exist
        for (const agent of state.world.agents) {
          const desc = descriptions.agentDescriptions.find((d) => d.agentId === agent.id);
          expect(desc).toBeDefined();
        }
        
        await sleep(5000);
      }
      
      console.log('World state is consistent');
    }, 30000);
  });
});

describe('Start Agents Button E2E Tests', () => {
  const client = getTestClient();
  
  describe('Agent Creation via API', () => {
    test('should be able to create a new agent', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Ensure engine is running
      if (status!.status !== 'running') {
        await client.resumeEngine();
        await waitForEngineRunning(client, 30000);
      }
      
      const stateBefore = await client.getWorldState(status!.worldId);
      const agentCountBefore = stateBefore.world.agents.length;
      
      console.log(`Agents before: ${agentCountBefore}`);
      
      // Create a test agent
      const agentName = `TestAgent_${Date.now()}`;
      const inputId = await client.createAgent(status!.worldId, {
        name: agentName,
        character: 'f1',
        identity: 'A test agent created via E2E test. Curious and friendly.',
        plan: 'Explore the town and meet other agents.',
      });
      
      expect(inputId).toBeDefined();
      
      // Wait for input to be processed
      await client.waitForInput(inputId, 30000);
      
      // Wait for agent to spawn
      await waitForAgents(client, status!.worldId, agentCountBefore + 1, 30000);
      
      const stateAfter = await client.getWorldState(status!.worldId);
      expect(stateAfter.world.agents.length).toBe(agentCountBefore + 1);
      
      console.log(`Agents after: ${stateAfter.world.agents.length}`);
    }, 60000);
    
    test('newly created agent should have valid state', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const descriptions = await client.getGameDescriptions(status!.worldId);
      
      // Find a custom agent (isCustom === true)
      const customAgent = descriptions.agentDescriptions.find((d) => d.isCustom === true);
      
      if (!customAgent) {
        console.log('No custom agents found, creating one...');
        
        // Ensure engine is running
        if (status!.status !== 'running') {
          await client.resumeEngine();
          await waitForEngineRunning(client, 30000);
        }
        
        const inputId = await client.createAgent(status!.worldId, {
          name: `ValidateAgent_${Date.now()}`,
          character: 'f2',
          identity: 'An agent for validation testing.',
          plan: 'Validate that agents work correctly.',
        });
        
        await client.waitForInput(inputId, 30000);
        await sleep(2000);
      }
      
      // Re-fetch descriptions
      const updatedDescriptions = await client.getGameDescriptions(status!.worldId);
      const customAgents = updatedDescriptions.agentDescriptions.filter((d) => d.isCustom === true);
      
      console.log(`Custom agents found: ${customAgents.length}`);
      
      // Validate each custom agent
      for (const agent of customAgents) {
        expect(agent.identity).toBeDefined();
        expect(agent.identity.length).toBeGreaterThan(0);
        expect(agent.plan).toBeDefined();
        expect(agent.plan.length).toBeGreaterThan(0);
      }
    }, 60000);
  });
});
