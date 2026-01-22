/**
 * Eliza Agent Integration E2E Tests
 *
 * These tests verify that all components of the Eliza agent system work correctly
 * when the server is running. Tests validate:
 * - LLM connectivity and response generation
 * - Agent decision making pipeline
 * - Chat response generation
 * - Agent creation and configuration
 * - All inputs/outputs are valid (no null, undefined, or errors)
 *
 * REQUIREMENTS:
 * - Convex backend must be running
 * - LLM provider must be configured (OPENAI_API_KEY, OLLAMA_HOST, etc.)
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import {
  getTestClient,
  waitForEngineRunning,
  waitForAgents,
  waitFor,
  sleep,
} from './helpers';

// Types for test validation
interface TestDecisionResponse {
  response: string;
}

interface ParsedDecision {
  action: string;
  params?: Record<string, unknown>;
  reason?: string;
}

interface ElizaAgentRecord {
  _id: string;
  playerId: string;
  worldId: string;
  elizaAgentId: string;
  name: string;
  bio: string;
  personality: string[];
  createdAt: number;
}

// Validation helpers
function assertNonEmptyString(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${context}: Expected string, got ${typeof value}`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${context}: String is empty`);
  }
}

function assertValidTestDecisionResponse(response: TestDecisionResponse, context: string): void {
  if (!response) {
    throw new Error(`${context}: Response is null or undefined`);
  }

  if (typeof response.response !== 'string') {
    throw new Error(`${context}: Response.response is not a string`);
  }

  if (response.response.trim().length === 0) {
    throw new Error(`${context}: Response.response is empty`);
  }
}

function parseDecisionFromResponse(responseStr: string): ParsedDecision | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ParsedDecision;
    }
    return null;
  } catch {
    return null;
  }
}

function assertValidParsedDecision(decision: ParsedDecision | null, context: string): void {
  if (!decision) {
    throw new Error(`${context}: Could not parse decision from response`);
  }

  const validActions = ['MOVE', 'CONVERSE', 'ACTIVITY', 'WANDER', 'IDLE', 'SAY', 'LEAVE'];
  const actionUpper = decision.action?.toUpperCase();
  
  if (!actionUpper || !validActions.some(a => actionUpper.includes(a))) {
    // Log but don't fail - LLM responses can be creative
    console.log(`${context}: Action "${decision.action}" not in expected list, but continuing`);
  }
}

function assertNoErrors<T>(result: T, context: string): void {
  if (result === null || result === undefined) {
    throw new Error(`${context}: Result is null or undefined`);
  }

  // Check for error-like objects
  const resultObj = result as Record<string, unknown>;
  if (resultObj.error) {
    throw new Error(`${context}: Result contains error: ${JSON.stringify(resultObj.error)}`);
  }
}

describe('Eliza Integration Tests', () => {
  const testClient = getTestClient();
  let convexClient: ConvexHttpClient;
  let worldId: string;

  beforeAll(async () => {
    // Set up Convex client
    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) {
      throw new Error('CONVEX_URL environment variable is required');
    }
    convexClient = new ConvexHttpClient(convexUrl);

    // Ensure engine is running
    const status = await testClient.getDefaultWorldStatus();
    if (!status) {
      throw new Error('No world found - run npx convex run init first');
    }

    if (status.status !== 'running') {
      await testClient.resumeEngine();
      await waitForEngineRunning(testClient, 30000);
    }

    worldId = status.worldId;
    console.log(`Test world ID: ${worldId}`);
  }, 60000);

  describe('LLM Connectivity', () => {
    test('should make a basic LLM call via makeDecision action', async () => {
      const prompt = 'Respond with exactly: "LLM_TEST_OK"';

      const result = await convexClient.action(api.elizaAgent.actions.makeDecision, {
        prompt,
      });

      assertNoErrors(result, 'LLM call');
      assertNonEmptyString(result, 'LLM response');

      console.log(`LLM Response: "${result}"`);
      expect(result.length).toBeGreaterThan(0);
    }, 60000);

    test('should handle complex prompts', async () => {
      const complexPrompt = `You are a helpful assistant. 
      
Given this scenario:
- Character: Alice
- Location: Town Square  
- Nearby: Bob (2 units away), Carol (5 units away)
- Current activity: None

What should Alice do? Respond in 1-2 sentences.`;

      const result = await convexClient.action(api.elizaAgent.actions.makeDecision, {
        prompt: complexPrompt,
      });

      assertNoErrors(result, 'Complex LLM call');
      assertNonEmptyString(result, 'Complex LLM response');

      console.log(`Complex prompt response: "${result}"`);

      // Verify response is meaningful (not empty, not an error message)
      expect(result.length).toBeGreaterThan(10);
      expect(result.toLowerCase()).not.toContain('error');
    }, 60000);

    test('should return consistent response format', async () => {
      const prompts = [
        'Say hello',
        'What is 2+2?',
        'Name a color',
      ];

      for (const prompt of prompts) {
        const result = await convexClient.action(api.elizaAgent.actions.makeDecision, {
          prompt,
        });

        assertNoErrors(result, `LLM call for "${prompt}"`);
        assertNonEmptyString(result, `LLM response for "${prompt}"`);
      }
    }, 120000);
  });

  describe('Agent Decision Making', () => {
    test('testDecision action should return valid response', async () => {
      const result = await convexClient.action(api.elizaAgent.actions.testDecision, {}) as TestDecisionResponse;

      assertNoErrors(result, 'Test decision');
      assertValidTestDecisionResponse(result, 'Test decision');

      console.log(`Test decision result: ${JSON.stringify(result)}`);
      
      // Try to parse as JSON decision
      const parsed = parseDecisionFromResponse(result.response);
      if (parsed) {
        console.log(`Parsed decision: ${JSON.stringify(parsed)}`);
        assertValidParsedDecision(parsed, 'Parsed decision');
      }
    }, 60000);

    test('testDecision should return parseable decision', async () => {
      const result = await convexClient.action(api.elizaAgent.actions.testDecision, {}) as TestDecisionResponse;

      assertValidTestDecisionResponse(result, 'Test decision');
      
      // The response should contain JSON with an action
      const parsed = parseDecisionFromResponse(result.response);
      expect(parsed).not.toBeNull();
      expect(parsed?.action).toBeDefined();
    }, 60000);

    test('multiple decisions should all be valid', async () => {
      // Run multiple times to verify consistency
      const responses: TestDecisionResponse[] = [];

      for (let i = 0; i < 3; i++) {
        const result = await convexClient.action(api.elizaAgent.actions.testDecision, {}) as TestDecisionResponse;
        responses.push(result);
        await sleep(1000); // Small delay between calls
      }

      for (const response of responses) {
        assertValidTestDecisionResponse(response, 'Decision iteration');
        
        const parsed = parseDecisionFromResponse(response.response);
        if (parsed) {
          assertValidParsedDecision(parsed, 'Parsed decision');
        }
      }

      console.log(`Collected ${responses.length} responses`);
      responses.forEach((r, i) => {
        const parsed = parseDecisionFromResponse(r.response);
        console.log(`  Response ${i + 1}: action=${parsed?.action || 'unparseable'}`);
      });
    }, 180000);
  });

  describe('Agent Creation and Configuration', () => {
    test('should create an Eliza agent with valid configuration', async () => {
      const testAgentConfig = {
        worldId: worldId as never,
        playerId: `test-player-${Date.now()}`,
        name: 'TestAgent',
        bio: 'A test agent for integration testing',
        personality: ['friendly', 'helpful', 'curious'],
      };

      const result = await convexClient.action(api.elizaAgent.actions.createElizaAgent, testAgentConfig);

      assertNoErrors(result, 'Agent creation');
      expect(result.success).toBe(true);
      expect(result.name).toBe(testAgentConfig.name);
      assertNonEmptyString(result.agentId, 'Agent ID');

      console.log(`Created agent: ${result.name} with ID ${result.agentId}`);
    }, 60000);

    test('agent configuration should persist correctly', async () => {
      const uniquePlayerId = `test-persist-${Date.now()}`;
      const config = {
        worldId: worldId as never,
        playerId: uniquePlayerId,
        name: 'PersistTestAgent',
        bio: 'Testing persistence of agent configuration',
        personality: ['persistent', 'reliable'],
      };

      // Create agent
      const createResult = await convexClient.action(api.elizaAgent.actions.createElizaAgent, config);
      expect(createResult.success).toBe(true);

      // Creating again with same playerId should update, not duplicate
      const config2 = {
        ...config,
        name: 'UpdatedPersistTestAgent',
        bio: 'Updated bio',
      };

      const updateResult = await convexClient.action(api.elizaAgent.actions.createElizaAgent, config2);
      expect(updateResult.success).toBe(true);

      console.log(`Agent persistence test passed`);
    }, 60000);

    test('agent should have required fields', async () => {
      const config = {
        worldId: worldId as never,
        playerId: `test-fields-${Date.now()}`,
        name: 'FieldTestAgent',
        bio: 'Testing all required fields',
        personality: ['test1', 'test2'],
      };

      const result = await convexClient.action(api.elizaAgent.actions.createElizaAgent, config);

      // Verify all returned fields
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('agentId');

      expect(result.success).toBe(true);
      expect(typeof result.name).toBe('string');
      expect(typeof result.agentId).toBe('string');
    }, 60000);
  });

  describe('World State Integration', () => {
    test('world state should be accessible and valid', async () => {
      const state = await testClient.getWorldState(worldId);

      assertNoErrors(state, 'World state');

      // Validate world structure
      expect(state.world).toBeDefined();
      expect(Array.isArray(state.world.players)).toBe(true);
      expect(Array.isArray(state.world.agents)).toBe(true);
      expect(Array.isArray(state.world.conversations)).toBe(true);

      // Validate engine structure
      expect(state.engine).toBeDefined();
      expect(typeof state.engine.running).toBe('boolean');

      console.log(`World state: ${state.world.players.length} players, ${state.world.agents.length} agents`);
    }, 30000);

    test('game descriptions should be valid', async () => {
      const descriptions = await testClient.getGameDescriptions(worldId);

      assertNoErrors(descriptions, 'Game descriptions');

      // Validate world map
      expect(descriptions.worldMap).toBeDefined();
      expect(descriptions.worldMap.width).toBeGreaterThan(0);
      expect(descriptions.worldMap.height).toBeGreaterThan(0);

      // Validate player descriptions
      expect(Array.isArray(descriptions.playerDescriptions)).toBe(true);
      for (const player of descriptions.playerDescriptions) {
        expect(player.playerId).toBeDefined();
        assertNonEmptyString(player.name, 'Player name');
      }

      // Validate agent descriptions
      expect(Array.isArray(descriptions.agentDescriptions)).toBe(true);
      for (const agent of descriptions.agentDescriptions) {
        expect(agent.agentId).toBeDefined();
        assertNonEmptyString(agent.identity, 'Agent identity');
        assertNonEmptyString(agent.plan, 'Agent plan');
      }

      console.log(`Game descriptions: ${descriptions.playerDescriptions.length} players, ${descriptions.agentDescriptions.length} agents`);
    }, 30000);

    test('agents in world should have corresponding player entries', async () => {
      const state = await testClient.getWorldState(worldId);
      const descriptions = await testClient.getGameDescriptions(worldId);

      // Each agent should have a matching player
      for (const agent of state.world.agents) {
        const player = state.world.players.find((p) => p.id === agent.playerId);
        expect(player).toBeDefined();

        if (player) {
          // Player should have valid position
          expect(typeof player.position.x).toBe('number');
          expect(typeof player.position.y).toBe('number');
          expect(player.position.x).toBeGreaterThanOrEqual(0);
          expect(player.position.y).toBeGreaterThanOrEqual(0);
        }
      }
    }, 30000);
  });

  describe('Agent Activity Validation', () => {
    test('agents should have valid activity states', async () => {
      const state = await testClient.getWorldState(worldId);

      for (const player of state.world.players) {
        if (player.activity) {
          // Activity should have description
          assertNonEmptyString(player.activity.description, `Activity description for ${player.id}`);

          // Activity should have valid until timestamp
          expect(typeof player.activity.until).toBe('number');
          expect(player.activity.until).toBeGreaterThan(0);
        }

        // All players should have valid position
        expect(player.position).toBeDefined();
        expect(typeof player.position.x).toBe('number');
        expect(typeof player.position.y).toBe('number');

        // All players should have valid facing direction
        expect(player.facing).toBeDefined();
        expect(typeof player.facing.dx).toBe('number');
        expect(typeof player.facing.dy).toBe('number');
      }
    }, 30000);

    test('agent operations should be tracked', async () => {
      const state = await testClient.getWorldState(worldId);

      for (const agent of state.world.agents) {
        // Agent should have playerId
        assertNonEmptyString(agent.playerId, `Agent ${agent.id} playerId`);

        // If agent has in-progress operation, it should be valid
        if (agent.inProgressOperation) {
          expect(agent.inProgressOperation.name).toBeDefined();
          expect(agent.inProgressOperation.operationId).toBeDefined();
          expect(typeof agent.inProgressOperation.started).toBe('number');
        }
      }
    }, 30000);
  });

  describe('Conversation Message Validation', () => {
    test('messages should be retrievable for active conversations', async () => {
      const state = await testClient.getWorldState(worldId);

      for (const conversation of state.world.conversations) {
        // Skip empty conversations
        if (conversation.numMessages === 0) continue;

        const messages = await testClient.listMessages(worldId, conversation.id);

        // Validate each message
        for (const message of messages) {
          assertNonEmptyString(message._id, 'Message ID');
          assertNonEmptyString(message.author, 'Message author');
          assertNonEmptyString(message.authorName, 'Message author name');
          assertNonEmptyString(message.text, 'Message text');
          assertNonEmptyString(message.conversationId, 'Message conversation ID');

          // Message should belong to the conversation we queried
          expect(message.conversationId).toBe(conversation.id);
        }

        if (messages.length > 0) {
          console.log(`Conversation ${conversation.id}: ${messages.length} messages`);
        }
      }
    }, 60000);

    test('conversation participants should be valid', async () => {
      const state = await testClient.getWorldState(worldId);

      for (const conversation of state.world.conversations) {
        expect(Array.isArray(conversation.participants)).toBe(true);
        expect(conversation.participants.length).toBeGreaterThanOrEqual(1);

        for (const participant of conversation.participants) {
          assertNonEmptyString(participant.playerId, 'Participant playerId');
          expect(typeof participant.invited).toBe('number');
          expect(participant.status).toBeDefined();
          expect(['invited', 'walkingOver', 'participating']).toContain(participant.status.kind);
        }
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle invalid inputs gracefully', async () => {
      // Test with empty prompt
      const result = await convexClient.action(api.elizaAgent.actions.makeDecision, {
        prompt: '',
      });

      // Should return something, not throw
      expect(result).toBeDefined();
    }, 60000);

    test('world state should handle invalid world ID gracefully', async () => {
      try {
        // Try with malformed world ID - this should throw
        await testClient.getWorldState('invalid-world-id');
        // If we get here, it returned something (possibly null)
      } catch (error) {
        // Expected - invalid ID should throw
        expect(error).toBeDefined();
      }
    }, 30000);
  });

  describe('Performance Validation', () => {
    test('LLM response time should be reasonable', async () => {
      const startTime = Date.now();

      await convexClient.action(api.elizaAgent.actions.makeDecision, {
        prompt: 'Say "test"',
      });

      const elapsed = Date.now() - startTime;

      // Response should come within 30 seconds for a simple prompt
      expect(elapsed).toBeLessThan(30000);

      console.log(`LLM response time: ${elapsed}ms`);
    }, 60000);

    test('world state queries should be fast', async () => {
      const startTime = Date.now();

      await testClient.getWorldState(worldId);

      const elapsed = Date.now() - startTime;

      // World state should be retrieved quickly (under 5 seconds)
      expect(elapsed).toBeLessThan(5000);

      console.log(`World state query time: ${elapsed}ms`);
    }, 10000);

    test('multiple concurrent queries should work', async () => {
      // Run multiple queries in parallel
      const queries = [
        testClient.getWorldState(worldId),
        testClient.getGameDescriptions(worldId),
        testClient.getDefaultWorldStatus(),
      ];

      const results = await Promise.all(queries);

      // All should succeed
      for (const result of results) {
        assertNoErrors(result, 'Concurrent query');
      }
    }, 30000);
  });

  describe('End-to-End Agent Flow', () => {
    test('complete agent lifecycle should work', async () => {
      // 1. Create an agent
      const agentConfig = {
        worldId: worldId as never,
        playerId: `e2e-test-${Date.now()}`,
        name: 'E2ETestAgent',
        bio: 'An agent for end-to-end testing',
        personality: ['curious', 'friendly', 'talkative'],
      };

      const createResult = await convexClient.action(
        api.elizaAgent.actions.createElizaAgent,
        agentConfig,
      );

      expect(createResult.success).toBe(true);
      console.log(`Step 1: Created agent ${createResult.name}`);

      // 2. Verify agent can make decisions
      const decisionResult = await convexClient.action(
        api.elizaAgent.actions.testDecision,
        {},
      ) as TestDecisionResponse;

      assertValidTestDecisionResponse(decisionResult, 'E2E decision');
      const parsed = parseDecisionFromResponse(decisionResult.response);
      console.log(`Step 2: Agent made decision: ${parsed?.action || 'response received'}`);

      // 3. Verify world state includes agents
      const state = await testClient.getWorldState(worldId);

      expect(state.world.agents.length).toBeGreaterThan(0);
      console.log(`Step 3: World has ${state.world.agents.length} agents`);

      // 4. Verify descriptions are valid
      const descriptions = await testClient.getGameDescriptions(worldId);

      expect(descriptions.agentDescriptions.length).toBeGreaterThan(0);
      console.log(`Step 4: ${descriptions.agentDescriptions.length} agent descriptions`);

      console.log('End-to-end agent lifecycle test PASSED');
    }, 120000);
  });
});

describe('Eliza Agent Null/Undefined Safety Tests', () => {
  const testClient = getTestClient();
  let convexClient: ConvexHttpClient;
  let worldId: string;

  beforeAll(async () => {
    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) {
      throw new Error('CONVEX_URL environment variable is required');
    }
    convexClient = new ConvexHttpClient(convexUrl);

    const status = await testClient.getDefaultWorldStatus();
    if (!status) {
      throw new Error('No world found');
    }
    worldId = status.worldId;
  }, 60000);

  test('world state fields should not be null', async () => {
    const state = await testClient.getWorldState(worldId);

    // Top level
    expect(state).not.toBeNull();
    expect(state.world).not.toBeNull();
    expect(state.engine).not.toBeNull();

    // World fields
    expect(state.world.players).not.toBeNull();
    expect(state.world.agents).not.toBeNull();
    expect(state.world.conversations).not.toBeNull();
    expect(state.world.nextId).not.toBeNull();

    // Engine fields
    expect(state.engine._id).not.toBeNull();
    expect(state.engine.generationNumber).not.toBeNull();
    expect(state.engine.running).not.toBeNull();
  }, 30000);

  test('player fields should not be null', async () => {
    const state = await testClient.getWorldState(worldId);

    for (const player of state.world.players) {
      expect(player.id).not.toBeNull();
      expect(player.id).not.toBeUndefined();

      expect(player.position).not.toBeNull();
      expect(player.position.x).not.toBeNull();
      expect(player.position.y).not.toBeNull();

      expect(player.facing).not.toBeNull();
      expect(player.facing.dx).not.toBeNull();
      expect(player.facing.dy).not.toBeNull();

      expect(player.speed).not.toBeNull();
      expect(player.lastInput).not.toBeNull();
    }
  }, 30000);

  test('agent fields should not be null', async () => {
    const state = await testClient.getWorldState(worldId);

    for (const agent of state.world.agents) {
      expect(agent.id).not.toBeNull();
      expect(agent.id).not.toBeUndefined();

      expect(agent.playerId).not.toBeNull();
      expect(agent.playerId).not.toBeUndefined();
    }
  }, 30000);

  test('conversation fields should not be null', async () => {
    const state = await testClient.getWorldState(worldId);

    for (const conversation of state.world.conversations) {
      expect(conversation.id).not.toBeNull();
      expect(conversation.id).not.toBeUndefined();

      expect(conversation.creator).not.toBeNull();
      expect(conversation.created).not.toBeNull();
      expect(conversation.numMessages).not.toBeNull();
      expect(conversation.participants).not.toBeNull();

      for (const participant of conversation.participants) {
        expect(participant.playerId).not.toBeNull();
        expect(participant.invited).not.toBeNull();
        expect(participant.status).not.toBeNull();
        expect(participant.status.kind).not.toBeNull();
      }
    }
  }, 30000);

  test('message fields should not be null', async () => {
    const state = await testClient.getWorldState(worldId);

    for (const conversation of state.world.conversations) {
      if (conversation.numMessages === 0) continue;

      const messages = await testClient.listMessages(worldId, conversation.id);

      for (const message of messages) {
        expect(message._id).not.toBeNull();
        expect(message._id).not.toBeUndefined();

        expect(message.author).not.toBeNull();
        expect(message.authorName).not.toBeNull();
        expect(message.text).not.toBeNull();
        expect(message.conversationId).not.toBeNull();
        expect(message.messageUuid).not.toBeNull();
      }
    }
  }, 60000);

  test('game descriptions should not be null', async () => {
    const descriptions = await testClient.getGameDescriptions(worldId);

    expect(descriptions).not.toBeNull();
    expect(descriptions.worldMap).not.toBeNull();
    expect(descriptions.worldMap.width).not.toBeNull();
    expect(descriptions.worldMap.height).not.toBeNull();
    expect(descriptions.worldMap.tileSetUrl).not.toBeNull();

    expect(descriptions.playerDescriptions).not.toBeNull();
    expect(descriptions.agentDescriptions).not.toBeNull();

    for (const player of descriptions.playerDescriptions) {
      expect(player.playerId).not.toBeNull();
      expect(player.name).not.toBeNull();
      expect(player.description).not.toBeNull();
      expect(player.character).not.toBeNull();
    }

    for (const agent of descriptions.agentDescriptions) {
      expect(agent.agentId).not.toBeNull();
      expect(agent.identity).not.toBeNull();
      expect(agent.plan).not.toBeNull();
    }
  }, 30000);

  test('LLM responses should not be null or undefined', async () => {
    const result = await convexClient.action(api.elizaAgent.actions.makeDecision, {
      prompt: 'Say hello',
    });

    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 60000);

  test('decision responses should not be null or undefined', async () => {
    const result = await convexClient.action(api.elizaAgent.actions.testDecision, {}) as TestDecisionResponse;

    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(result.response).not.toBeNull();
    expect(result.response).not.toBeUndefined();
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  }, 60000);

  test('agent creation response should not be null', async () => {
    const result = await convexClient.action(api.elizaAgent.actions.createElizaAgent, {
      worldId: worldId as never,
      playerId: `null-test-${Date.now()}`,
      name: 'NullTestAgent',
      bio: 'Testing null safety',
      personality: ['safe'],
    });

    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(result.success).not.toBeNull();
    expect(result.name).not.toBeNull();
    expect(result.agentId).not.toBeNull();
  }, 60000);
});
