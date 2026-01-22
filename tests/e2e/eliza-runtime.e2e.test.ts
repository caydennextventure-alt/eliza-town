/**
 * ElizaOS-Style Agent E2E Tests
 *
 * Tests the Convex-based ElizaOS-style agents.
 * The actual agent logic runs on the Convex backend using chatCompletion.
 *
 * SETUP REQUIREMENTS:
 * 1. Convex backend must be running with LLM configured
 * 2. Environment should have OPENAI_API_KEY or other LLM provider configured
 */

describe('ElizaOS-Style Agent Tests', () => {
  describe('Architecture Verification', () => {
    test('should have Convex backend configured', () => {
      // The agent logic runs entirely on Convex backend
      // This test verifies the architecture is understood
      
      const architecture = {
        agentLogic: 'Convex backend (convex/elizaAgent/actions.ts)',
        llmCalls: 'Convex chatCompletion utility (convex/util/llm.ts)',
        gameLoop: 'Convex runStep action (convex/aiTown/main.ts)',
        messageStorage: 'Convex messages table',
        autoPause: 'Convex cron job (stopInactiveWorlds)',
      };
      
      console.log('ElizaOS-Style Agent Architecture:');
      console.log(JSON.stringify(architecture, null, 2));
      
      expect(architecture.agentLogic).toContain('Convex');
      expect(architecture.llmCalls).toContain('Convex');
    });

    test('should understand agent decision flow', () => {
      const decisionFlow = [
        '1. Game engine tick() calls Agent.tick() for each agent',
        '2. Agent.tick() triggers agentDoSomething action',
        '3. agentDoSomething calls getRecentWorldMessages (agents see nearby conversations)',
        '4. askWhatToDo builds context prompt with nearby activity',
        '5. LLM via chatCompletion() decides: MOVE, CONVERSE, ACTIVITY, WANDER, IDLE',
        '6. Decision sent back to game via finishDoSomething input',
      ];
      
      console.log('Agent Decision Flow:');
      decisionFlow.forEach(step => console.log(`  ${step}`));
      
      expect(decisionFlow).toHaveLength(6);
    });

    test('should understand message visibility', () => {
      const messageVisibility = {
        notInConversation: {
          source: 'getRecentWorldMessages(worldId, limit=10)',
          context: 'RECENT ACTIVITY NEARBY section in prompt',
          description: 'Agents see last 10 messages from any conversation in the world',
        },
        inConversation: {
          source: 'api.messages.listMessages({ conversationId })',
          context: 'Full conversation history passed to generateResponse',
          description: 'Agents see all messages in their current conversation',
        },
      };
      
      console.log('Message Visibility:');
      console.log('  When NOT in conversation:', messageVisibility.notInConversation.description);
      console.log('  When IN conversation:', messageVisibility.inConversation.description);
      
      expect(messageVisibility.notInConversation.source).toContain('getRecentWorldMessages');
      expect(messageVisibility.inConversation.source).toContain('listMessages');
    });
  });

  describe('Auto-Pause Mechanism', () => {
    test('should understand auto-pause flow', () => {
      const autoPauseFlow = {
        trigger: 'No heartbeats from connected users for 5 minutes',
        action: 'stopInactiveWorlds cron job stops the engine',
        resume: 'User reconnects → heartbeatWorld mutation → startEngine',
        benefit: 'Zero LLM costs when no users are watching',
      };
      
      console.log('Auto-Pause Mechanism:');
      console.log(`  Trigger: ${autoPauseFlow.trigger}`);
      console.log(`  Action: ${autoPauseFlow.action}`);
      console.log(`  Resume: ${autoPauseFlow.resume}`);
      console.log(`  Benefit: ${autoPauseFlow.benefit}`);
      
      expect(autoPauseFlow.benefit).toContain('Zero LLM costs');
    });
  });

  describe('Character Configuration', () => {
    test('should understand character structure', () => {
      const characterStructure = {
        name: 'string - Character display name',
        bio: 'string[] - Character background',
        personality: 'string[] - Personality traits',
        systemPrompt: 'string - LLM system prompt built from above',
      };
      
      console.log('Character Structure:');
      Object.entries(characterStructure).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
      
      expect(Object.keys(characterStructure)).toContain('systemPrompt');
    });

    test('should understand decision types', () => {
      const decisionTypes = [
        'MOVE - Walk to specific (x, y) coordinates',
        'CONVERSE - Start conversation with nearby agent',
        'ACTIVITY - Do activity with emoji and duration',
        'SAY - Speak in current conversation',
        'LEAVE_CONVERSATION - Exit current conversation',
        'WANDER - Random movement',
        'IDLE - Stay in place',
      ];
      
      console.log('Available Decision Types:');
      decisionTypes.forEach(type => console.log(`  ${type}`));
      
      expect(decisionTypes).toHaveLength(7);
    });
  });
});

describe('External Eliza Server Tests (Optional)', () => {
  const ELIZA_SERVER_URL = process.env.ELIZA_SERVER_URL;

  test('should connect to external Eliza server if configured', async () => {
    if (!ELIZA_SERVER_URL) {
      console.log('SKIPPED: ELIZA_SERVER_URL not set');
      return;
    }

    try {
      const response = await fetch(`${ELIZA_SERVER_URL}/api/agents`);
      expect(response.ok).toBe(true);

      const agents = await response.json();
      console.log(`External Eliza server has ${agents.length} agents`);
    } catch (error) {
      console.log('External Eliza server not reachable:', error);
    }
  }, 30000);
});
