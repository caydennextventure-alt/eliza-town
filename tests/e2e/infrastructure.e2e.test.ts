/**
 * Infrastructure Validation Tests
 * 
 * These tests validate the test infrastructure itself without requiring
 * a real Convex deployment.
 */

import {
  createTestClient,
  waitFor,
  sleep,
  captureWorldSnapshot,
  assertPlayersHaveMoved,
  assertValidMessages,
} from './helpers';

describe('Test Infrastructure Validation', () => {
  describe('Client Creation', () => {
    test('should throw error without CONVEX_URL', () => {
      const originalEnv = process.env.CONVEX_URL;
      delete process.env.CONVEX_URL;
      
      expect(() => createTestClient()).toThrow('CONVEX_URL environment variable is required');
      
      process.env.CONVEX_URL = originalEnv;
    });
    
    test('should create client with valid URL', () => {
      const client = createTestClient('https://test.convex.cloud');
      expect(client).toBeDefined();
      expect(client.client).toBeDefined();
    });
  });
  
  describe('Wait Utilities', () => {
    test('waitFor should resolve when predicate is true', async () => {
      let counter = 0;
      const result = await waitFor(
        async () => ++counter,
        (n) => n >= 3,
        { timeout: 5000, interval: 100, description: 'counter to reach 3' }
      );
      expect(result).toBe(3);
    });
    
    test('waitFor should timeout when predicate never true', async () => {
      await expect(
        waitFor(
          async () => 1,
          (n) => n > 10,
          { timeout: 500, interval: 100, description: 'impossible condition' }
        )
      ).rejects.toThrow('Timeout waiting for impossible condition');
    });
    
    test('sleep should delay execution', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });
  });
  
  describe('Snapshot Utilities', () => {
    test('assertPlayersHaveMoved should pass when positions differ', () => {
      const initial = {
        playerCount: 2,
        agentCount: 2,
        conversationCount: 0,
        positions: [
          { playerId: 'p1', x: 0, y: 0 },
          { playerId: 'p2', x: 10, y: 10 },
        ],
        timestamp: 1000,
      };
      
      const current = {
        playerCount: 2,
        agentCount: 2,
        conversationCount: 0,
        positions: [
          { playerId: 'p1', x: 5, y: 5 }, // Moved
          { playerId: 'p2', x: 10, y: 10 }, // Same
        ],
        timestamp: 2000,
      };
      
      expect(() => assertPlayersHaveMoved(initial, current)).not.toThrow();
    });
    
    test('assertPlayersHaveMoved should fail when no movement', () => {
      const snapshot = {
        playerCount: 1,
        agentCount: 1,
        conversationCount: 0,
        positions: [{ playerId: 'p1', x: 0, y: 0 }],
        timestamp: 1000,
      };
      
      expect(() => assertPlayersHaveMoved(snapshot, snapshot)).toThrow('Expected at least one player to have moved');
    });
  });
  
  describe('Message Validation', () => {
    test('assertValidMessages should pass with valid messages', () => {
      const messages = [
        { text: 'Hello', author: 'p1', authorName: 'Alice' },
        { text: 'Hi there', author: 'p2', authorName: 'Bob' },
      ];
      
      expect(() => assertValidMessages(messages, 2)).not.toThrow();
    });
    
    test('assertValidMessages should fail with empty text', () => {
      const messages = [
        { text: '', author: 'p1', authorName: 'Alice' },
      ];
      
      expect(() => assertValidMessages(messages, 1)).toThrow('empty text');
    });
    
    test('assertValidMessages should fail with insufficient messages', () => {
      const messages = [
        { text: 'Hello', author: 'p1', authorName: 'Alice' },
      ];
      
      expect(() => assertValidMessages(messages, 5)).toThrow('Expected at least 5 messages');
    });
  });
});
