#!/usr/bin/env npx ts-node
/**
 * Cleanup Test Agents Script
 * 
 * Run this script to remove all test agents (custom agents) from the default world.
 * 
 * Usage:
 *   npx ts-node scripts/cleanup-test-agents.ts
 *   
 * Or via npm script:
 *   npm run cleanup:test-agents
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env.test') });
config({ path: path.resolve(process.cwd(), '.env') });

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const TEST_AGENT_PATTERNS = [
  /^TestAgent_\d+$/,
  /^ToRemove_\d+$/,
  /^E2EAgent_/,
  /^Test_/,
  /^ValidateAgent_/,
];

async function main() {
  const convexUrl = process.env.CONVEX_URL;
  
  if (!convexUrl) {
    console.error('Error: CONVEX_URL environment variable is required');
    console.error('Set it in .env or .env.test file');
    process.exit(1);
  }
  
  console.log(`Connecting to Convex at: ${convexUrl.substring(0, 50)}...`);
  
  const client = new ConvexHttpClient(convexUrl);
  
  // Get the default world
  const worldStatus = await client.query(api.world.defaultWorldStatus, {});
  
  if (!worldStatus) {
    console.error('Error: No default world found');
    process.exit(1);
  }
  
  console.log(`Found default world: ${worldStatus.worldId}`);
  console.log(`World status: ${worldStatus.status}`);
  
  // Get world state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worldState = await client.query(api.world.worldState as any, { 
    worldId: worldStatus.worldId
  }) as { world: { agents: Array<{ id: string; playerId: string }> } };
  
  // Get descriptions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const descriptions = await client.query(api.world.gameDescriptions as any, { 
    worldId: worldStatus.worldId
  }) as { 
    playerDescriptions: Array<{ playerId: string; name: string }>;
    agentDescriptions: Array<{ agentId: string; isCustom?: boolean }>;
  };
  
  console.log(`\nFound ${worldState.world.agents.length} total agents`);
  
  // Find test agents to remove
  const agentsToRemove: Array<{ agentId: string; name: string; reason: string }> = [];
  
  for (const agent of worldState.world.agents) {
    const agentDesc = descriptions.agentDescriptions.find(d => d.agentId === agent.id);
    const playerDesc = descriptions.playerDescriptions.find(d => d.playerId === agent.playerId);
    
    if (!playerDesc || !agentDesc) continue;
    
    const name = playerDesc.name;
    
    // Check if it matches test patterns
    const matchedPattern = TEST_AGENT_PATTERNS.find(pattern => pattern.test(name));
    
    if (matchedPattern) {
      agentsToRemove.push({ 
        agentId: agent.id, 
        name, 
        reason: `Matches pattern: ${matchedPattern.source}` 
      });
    } else if (agentDesc.isCustom) {
      agentsToRemove.push({ 
        agentId: agent.id, 
        name, 
        reason: 'Custom agent (isCustom=true)' 
      });
    }
  }
  
  if (agentsToRemove.length === 0) {
    console.log('\nNo test agents found to clean up.');
    return;
  }
  
  console.log(`\nFound ${agentsToRemove.length} test agent(s) to remove:`);
  for (const agent of agentsToRemove) {
    console.log(`  - ${agent.name} (${agent.agentId.substring(0, 8)}...): ${agent.reason}`);
  }
  
  console.log('\nRemoving agents...');
  
  let removedCount = 0;
  let failedCount = 0;
  
  for (const agent of agentsToRemove) {
    try {
      console.log(`  Removing ${agent.name}...`);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inputId = await client.mutation(api.world.removeAgent as any, {
        worldId: worldStatus.worldId,
        agentId: agent.agentId,
      });
      
      // Wait for the input to be processed
      const startTime = Date.now();
      const timeout = 30000;
      
      while (Date.now() - startTime < timeout) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await client.query(api.aiTown.main.inputStatus as any, { 
          inputId: inputId
        });
        
        if (result !== null) {
          const typed = result as { kind: string; message?: string };
          if (typed.kind === 'error') {
            throw new Error(`Input failed: ${typed.message}`);
          }
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      console.log(`    ✓ Removed ${agent.name}`);
      removedCount++;
      
      // Small delay between removals
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`    ✗ Failed to remove ${agent.name}:`, error);
      failedCount++;
    }
  }
  
  console.log(`\nCleanup complete:`);
  console.log(`  Removed: ${removedCount}`);
  console.log(`  Failed: ${failedCount}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
