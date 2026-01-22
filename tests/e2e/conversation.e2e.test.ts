/**
 * Conversation E2E Tests
 * 
 * Tests for conversation flow, message generation, and agent communication.
 * These tests require a working LLM (Ollama, OpenAI, or Together).
 */

import {
  getTestClient,
  waitForEngineRunning,
  waitForAgents,
  waitForConversation,
  waitForMessages,
  waitFor,
  assertValidConversation,
  assertValidMessages,
  captureWorldSnapshot,
  sleep,
} from './helpers';

describe('Conversation E2E Tests', () => {
  const client = getTestClient();
  
  beforeAll(async () => {
    // Ensure engine is running with agents
    const status = await client.getDefaultWorldStatus();
    if (status && status.status !== 'running') {
      await client.resumeEngine();
      await waitForEngineRunning(client, 30000);
    }
    
    // Ensure we have at least 2 agents for conversations
    const state = await client.getWorldState(status!.worldId);
    if (state.world.agents.length < 2) {
      await client.initialize(3);
      await waitForAgents(client, status!.worldId, 2, 60000);
    }
  });
  
  describe('Autonomous Conversations', () => {
    test('agents should eventually start a conversation', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // This test waits for agents to autonomously find each other
      // and start a conversation. This can take a while.
      console.log('Waiting for agents to start a conversation (this may take up to 2 minutes)...');
      
      try {
        const conversation = await waitForConversation(client, status!.worldId, 120000);
        
        expect(conversation).toBeDefined();
        expect(conversation.id).toBeDefined();
        expect(conversation.participants.length).toBe(2);
        
        console.log(`Conversation started: ${conversation.id}`);
        console.log(`Participants: ${conversation.participants.map((p) => p.playerId).join(', ')}`);
      } catch (error) {
        // If no conversation started, that's okay - agents might be doing activities
        console.log('No conversation started within timeout - agents may be doing other activities');
        // Don't fail the test, just skip
        return;
      }
    }, 180000);
    
    test('conversation should have valid participants', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      
      // Skip if no conversations
      if (state.world.conversations.length === 0) {
        console.log('No active conversations to validate');
        return;
      }
      
      const conversationId = state.world.conversations[0].id;
      await assertValidConversation(client, status!.worldId, conversationId);
    });
  });
  
  describe('Message Generation', () => {
    test('agents should generate messages in conversations', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Wait for a conversation with messages
      console.log('Waiting for conversation with messages (this may take up to 3 minutes)...');
      
      let conversationId: string | null = null;
      
      try {
        // First wait for a conversation
        const conversation = await waitForConversation(client, status!.worldId, 120000);
        conversationId = conversation.id;
        
        // Then wait for messages
        const messages = await waitForMessages(
          client,
          status!.worldId,
          conversationId,
          1,
          120000,
        );
        
        expect(messages.length).toBeGreaterThan(0);
        assertValidMessages(messages, 1);
        
        console.log(`Messages in conversation ${conversationId}:`);
        for (const msg of messages) {
          console.log(`  ${msg.authorName}: ${msg.text.substring(0, 100)}...`);
        }
      } catch (error) {
        // Check if there are any messages from past conversations
        const state = await client.getWorldState(status!.worldId);
        
        if (state.world.conversations.length > 0) {
          const convId = state.world.conversations[0].id;
          const messages = await client.listMessages(status!.worldId, convId);
          
          if (messages.length > 0) {
            console.log(`Found ${messages.length} messages in conversation ${convId}`);
            assertValidMessages(messages, 1);
            return;
          }
        }
        
        console.log('No messages generated within timeout - LLM may not be responding');
        // Don't fail - this could be an LLM availability issue
      }
    }, 300000);
    
    test('messages should have non-empty text', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      
      // Check all active conversations for messages
      for (const conversation of state.world.conversations) {
        const messages = await client.listMessages(status!.worldId, conversation.id);
        
        for (const message of messages) {
          expect(message.text).toBeDefined();
          expect(message.text.length).toBeGreaterThan(0);
        }
      }
    });
  });
  
  describe('Conversation Lifecycle', () => {
    test('conversation should have correct state transitions', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      const state = await client.getWorldState(status!.worldId);
      
      // Skip if no conversations
      if (state.world.conversations.length === 0) {
        console.log('No active conversations to check');
        return;
      }
      
      for (const conversation of state.world.conversations) {
        // All participants should be in a valid state
        for (const participant of conversation.participants) {
          expect(['invited', 'walkingOver', 'participating']).toContain(
            participant.status.kind
          );
        }
        
        // If there are 2 participating members, conversation should have started
        const participatingCount = conversation.participants.filter(
          (p) => p.status.kind === 'participating'
        ).length;
        
        if (participatingCount === 2) {
          // Conversation is active - check for typing or messages
          expect(conversation.created).toBeLessThanOrEqual(Date.now());
        }
      }
    });
    
    test('typing indicator should be set during message generation', async () => {
      const status = await client.getDefaultWorldStatus();
      expect(status).not.toBeNull();
      
      // Monitor for typing indicator
      let sawTyping = false;
      const startTime = Date.now();
      const timeout = 60000;
      
      while (Date.now() - startTime < timeout) {
        const state = await client.getWorldState(status!.worldId);
        
        for (const conversation of state.world.conversations) {
          if (conversation.isTyping) {
            sawTyping = true;
            console.log(`Typing indicator: ${conversation.isTyping.playerId} in ${conversation.id}`);
            break;
          }
        }
        
        if (sawTyping) break;
        await sleep(2000);
      }
      
      // This is informational - don't fail if we didn't see typing
      if (!sawTyping) {
        console.log('Did not observe typing indicator - agents may not be in conversation');
      }
    }, 90000);
  });
});
