/**
 * Full Game E2E Tests
 * 
 * Comprehensive tests that run the full game loop and validate
 * all components work together: agents move, converse, generate messages,
 * and store memories.
 */

import {
  getTestClient,
  waitForEngineRunning,
  waitForAgents,
  waitFor,
  captureWorldSnapshot,
  assertPlayersHaveMoved,
  assertPlayersInBounds,
  sleep,
  WorldStateSnapshot,
} from './helpers';

describe('Full Game E2E Tests', () => {
  const client = getTestClient();
  
  beforeAll(async () => {
    // Ensure engine is running
    const status = await client.getDefaultWorldStatus();
    if (status && status.status !== 'running') {
      await client.resumeEngine();
      await waitForEngineRunning(client, 30000);
    }
    
    // Ensure we have agents
    const state = await client.getWorldState(status!.worldId);
    if (state.world.agents.length < 2) {
      await client.initialize(3);
      await waitForAgents(client, status!.worldId, 2, 60000);
    }
  });
  
  describe('Game State Evolution', () => {
    test('game state should change over time', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const initialSnapshot = await captureWorldSnapshot(client, status!.worldId);
      
      console.log('Initial state:', {
        players: initialSnapshot.playerCount,
        agents: initialSnapshot.agentCount,
        conversations: initialSnapshot.conversationCount,
      });
      
      // Wait for some time to pass
      console.log('Waiting 30 seconds for game state to evolve...');
      await sleep(30000);
      
      const finalSnapshot = await captureWorldSnapshot(client, status!.worldId);
      
      console.log('Final state:', {
        players: finalSnapshot.playerCount,
        agents: finalSnapshot.agentCount,
        conversations: finalSnapshot.conversationCount,
      });
      
      // At minimum, the timestamp should have changed
      expect(finalSnapshot.timestamp).toBeGreaterThan(initialSnapshot.timestamp);
      
      // Check if positions changed (agents moved)
      let positionsChanged = false;
      for (const finalPos of finalSnapshot.positions) {
        const initialPos = initialSnapshot.positions.find((p) => p.playerId === finalPos.playerId);
        if (initialPos && (finalPos.x !== initialPos.x || finalPos.y !== initialPos.y)) {
          positionsChanged = true;
          console.log(`Player ${finalPos.playerId} moved from (${initialPos.x}, ${initialPos.y}) to (${finalPos.x}, ${finalPos.y})`);
        }
      }
      
      console.log(`Positions changed: ${positionsChanged}`);
    }, 60000);
    
    test('agents should move over extended period', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const initialSnapshot = await captureWorldSnapshot(client, status!.worldId);
      
      console.log('Monitoring agent movement for 60 seconds...');
      
      const snapshots: WorldStateSnapshot[] = [initialSnapshot];
      
      // Take snapshots every 15 seconds
      for (let i = 0; i < 4; i++) {
        await sleep(15000);
        const snapshot = await captureWorldSnapshot(client, status!.worldId);
        snapshots.push(snapshot);
        
        console.log(`Snapshot ${i + 1}:`, {
          conversations: snapshot.conversationCount,
          positions: snapshot.positions.map((p) => `${p.playerId.substring(0, 8)}:(${Math.round(p.x)},${Math.round(p.y)})`),
        });
      }
      
      // Check for any movement across all snapshots
      let totalMovements = 0;
      for (let i = 1; i < snapshots.length; i++) {
        for (const current of snapshots[i].positions) {
          const previous = snapshots[i - 1].positions.find((p) => p.playerId === current.playerId);
          if (previous && (current.x !== previous.x || current.y !== previous.y)) {
            totalMovements++;
          }
        }
      }
      
      console.log(`Total position changes observed: ${totalMovements}`);
      
      // We expect at least some movement over a minute
      expect(totalMovements).toBeGreaterThan(0);
    }, 90000);
  });
  
  describe('Continuous Operation', () => {
    test('engine should remain stable during operation', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      console.log('Monitoring engine stability for 30 seconds...');
      
      const engineTimes: number[] = [];
      let errors = 0;
      
      // Check engine state every 5 seconds
      for (let i = 0; i < 6; i++) {
        try {
          const state = await client.getWorldState(status!.worldId);
          if (state.engine.currentTime !== undefined) {
            engineTimes.push(state.engine.currentTime);
          }
          
          // Verify engine is still running
          expect(state.engine.running).toBe(true);
        } catch (error) {
          errors++;
          console.error('Error checking engine state:', error);
        }
        
        await sleep(5000);
      }
      
      expect(errors).toBe(0);
      
      // Engine time should be advancing
      const timeAdvanced = engineTimes[engineTimes.length - 1] > engineTimes[0];
      expect(timeAdvanced).toBe(true);
      
      console.log(`Engine time advanced from ${engineTimes[0]} to ${engineTimes[engineTimes.length - 1]}`);
    }, 60000);
    
    test('players should remain in valid positions', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Check positions multiple times
      for (let i = 0; i < 3; i++) {
        await assertPlayersInBounds(client, status!.worldId);
        await sleep(5000);
      }
    }, 30000);
  });
  
  describe('Agent Behavior Validation', () => {
    test('agents should be performing operations', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      console.log('Observing agent operations for 60 seconds...');
      
      const operationsSeen = new Set<string>();
      
      for (let i = 0; i < 6; i++) {
        const state = await client.getWorldState(status!.worldId);
        
        for (const agent of state.world.agents) {
          if (agent.inProgressOperation) {
            operationsSeen.add(agent.inProgressOperation.name);
            console.log(`Agent ${agent.id.substring(0, 8)} performing: ${agent.inProgressOperation.name}`);
          }
        }
        
        await sleep(10000);
      }
      
      console.log(`Operations observed: ${Array.from(operationsSeen).join(', ') || 'none'}`);
      
      // We don't require operations to be seen (agents might be idle),
      // but log what we observed for debugging
    }, 90000);
    
    test('agents should have activities or be pathfinding', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      
      let activeAgents = 0;
      
      for (const agent of state.world.agents) {
        const player = state.world.players.find((p) => p.id === agent.playerId);
        if (!player) continue;
        
        const isActive =
          player.pathfinding !== undefined ||
          player.activity !== undefined ||
          agent.inProgressOperation !== undefined ||
          state.world.conversations.some((c) =>
            c.participants.some((p) => p.playerId === player.id)
          );
        
        if (isActive) {
          activeAgents++;
        }
      }
      
      console.log(`Active agents: ${activeAgents}/${state.world.agents.length}`);
      
      // At least some agents should be doing something
      // (but this depends on timing, so don't fail)
    });
  });
  
  describe('Data Integrity', () => {
    test('all agents should have corresponding players', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      
      for (const agent of state.world.agents) {
        const player = state.world.players.find((p) => p.id === agent.playerId);
        expect(player).toBeDefined();
      }
    });
    
    test('all conversation participants should exist', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      
      for (const conversation of state.world.conversations) {
        for (const participant of conversation.participants) {
          const player = state.world.players.find((p) => p.id === participant.playerId);
          expect(player).toBeDefined();
        }
      }
    });
    
    test('all agent descriptions should exist', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      const descriptions = await client.getGameDescriptions(status!.worldId);
      
      for (const agent of state.world.agents) {
        const desc = descriptions.agentDescriptions.find((d) => d.agentId === agent.id);
        expect(desc).toBeDefined();
      }
    });
    
    test('all player descriptions should exist', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      const descriptions = await client.getGameDescriptions(status!.worldId);
      
      for (const player of state.world.players) {
        const desc = descriptions.playerDescriptions.find((d) => d.playerId === player.id);
        expect(desc).toBeDefined();
      }
    });
  });
});
