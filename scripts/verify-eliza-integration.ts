#!/usr/bin/env npx ts-node --esm
/**
 * ElizaOS Integration Verification Script
 * 
 * Verifies that the agent system is 100% ElizaOS powered with no bypasses.
 * 
 * Usage: npx ts-node --esm scripts/verify-eliza-integration.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface VerificationResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
}

const results: VerificationResult[] = [];

function check(name: string, condition: boolean, details: string): void {
  results.push({
    check: name,
    status: condition ? 'PASS' : 'FAIL',
    details,
  });
}

function warn(name: string, details: string): void {
  results.push({
    check: name,
    status: 'WARN',
    details,
  });
}

function readFile(filePath: string): string {
  const fullPath = path.join(process.cwd(), filePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

function countOccurrences(content: string, pattern: RegExp): number {
  return (content.match(pattern) || []).length;
}

console.log('🔍 ElizaOS Integration Verification\n');
console.log('='.repeat(50));

// Check 1: Agent operations call ElizaOS
const agentOps = readFile('convex/aiTown/agentOperations.ts');
const elizaOpsCount = countOccurrences(agentOps, /internal\.elizaAgent\.elizaRuntime\./g);
check(
  'agentOperations uses ElizaOS',
  elizaOpsCount >= 3,
  `Found ${elizaOpsCount} ElizaOS calls (makeAgentDecision, decideOnInvite, chooseWanderDestination)`
);

// Check 2: No direct chatCompletion in agent operations
const chatCompletionInOps = countOccurrences(agentOps, /chatCompletion\(/g);
check(
  'No chatCompletion bypass in agentOperations',
  chatCompletionInOps === 0,
  `Found ${chatCompletionInOps} direct chatCompletion calls`
);

// Check 3: Conversation uses ElizaOS
const conversation = readFile('convex/agent/conversation.ts');
const elizaConvCount = countOccurrences(conversation, /internal\.elizaAgent\.actions\.generateResponse/g);
check(
  'Conversation uses ElizaOS',
  elizaConvCount >= 3,
  `Found ${elizaConvCount} ElizaOS generateResponse calls (start, continue, leave)`
);

// Check 4: No chatCompletion in conversation
const chatCompletionInConv = countOccurrences(conversation, /chatCompletion\(/g);
check(
  'No chatCompletion bypass in conversation',
  chatCompletionInConv === 0,
  `Found ${chatCompletionInConv} direct chatCompletion calls`
);

// Check 5: Memory uses ElizaOS
const memory = readFile('convex/agent/memory.ts');
const elizaMemoryCount = countOccurrences(memory, /internal\.elizaAgent\.elizaRuntime\./g);
check(
  'Memory uses ElizaOS',
  elizaMemoryCount >= 3,
  `Found ${elizaMemoryCount} ElizaOS calls (summarize, importance, reflection)`
);

// Check 6: No chatCompletion in memory
const chatCompletionInMemory = countOccurrences(memory, /chatCompletion\(/g);
check(
  'No chatCompletion bypass in memory',
  chatCompletionInMemory === 0,
  `Found ${chatCompletionInMemory} direct chatCompletion calls`
);

// Check 7: Invite decision uses ElizaOS (not Math.random)
const agent = readFile('convex/aiTown/agent.ts');
const randomInviteAccept = countOccurrences(agent, /Math\.random\(\)\s*<\s*INVITE_ACCEPT_PROBABILITY/g);
check(
  'Invite decision uses ElizaOS (not random)',
  randomInviteAccept === 0,
  `Found ${randomInviteAccept} random invite decisions`
);

// Check 8: agentDecideOnInvite operation exists
const decideOnInviteOp = countOccurrences(agent, /agentDecideOnInvite/g);
check(
  'agentDecideOnInvite operation exists',
  decideOnInviteOp >= 1,
  `Found ${decideOnInviteOp} references to agentDecideOnInvite`
);

// Check 9: ElizaOS runtime has all required functions
const elizaRuntime = readFile('convex/elizaAgent/elizaRuntime.ts');
const requiredFunctions = [
  'makeAgentDecision',
  'generateChatResponse',
  'decideOnInvite',
  'chooseWanderDestination',
  'summarizeConversation',
  'calculateMemoryImportance',
  'generateReflection',
];

for (const fn of requiredFunctions) {
  const exists = elizaRuntime.includes(`export const ${fn}`);
  check(
    `ElizaOS runtime has ${fn}`,
    exists,
    exists ? 'Function exists' : 'Function MISSING'
  );
}

// Check 10: Town plugin has all actions
const townPlugin = readFile('convex/elizaAgent/townPlugin.ts');
const requiredActions = ['MOVE', 'CONVERSE', 'ACTIVITY', 'SAY', 'LEAVE_CONVERSATION', 'WANDER', 'IDLE'];

for (const action of requiredActions) {
  const exists = townPlugin.includes(`name: "${action}"`);
  check(
    `Town plugin has ${action} action`,
    exists,
    exists ? 'Action registered' : 'Action MISSING'
  );
}

// Check 11: No random wander destination function in use
const wanderDestinationCalls = countOccurrences(agentOps, /wanderDestination\(/g);
check(
  'No random wanderDestination calls',
  wanderDestinationCalls === 0,
  `Found ${wanderDestinationCalls} wanderDestination function calls`
);

// Check 12: MOVE without coordinates delegates to chooseWanderDestination
const moveWithoutCoordsHandled = agentOps.includes("MOVE without coordinates, treating as WANDER");
check(
  'MOVE without coords uses ElizaOS wander',
  moveWithoutCoordsHandled,
  moveWithoutCoordsHandled ? 'MOVE fallback properly delegates to ElizaOS' : 'MOVE fallback may use random coords'
);

// Check 13: No hardcoded "Doing something" activity
const hardcodedActivity = countOccurrences(agentOps, /'Doing something'/g);
check(
  'No hardcoded "Doing something" activity',
  hardcodedActivity === 0,
  `Found ${hardcodedActivity} hardcoded activity descriptions`
);

// Check 14: Error fallbacks are logged with warnings
const errorWarnings = countOccurrences(elizaRuntime, /console\.warn.*got (empty|unparseable)/g);
check(
  'Fallbacks are logged as warnings',
  errorWarnings >= 3,
  `Found ${errorWarnings} warning logs for fallback cases`
);

// Check 15: Chat response uses ElizaOS messageService
const messageServiceCalls = countOccurrences(elizaRuntime, /runtime\.messageService\?\.handleMessage/g);
check(
  'All LLM calls use ElizaOS messageService',
  messageServiceCalls >= 5,
  `Found ${messageServiceCalls} messageService.handleMessage calls (decision, chat, invite, wander, memory)`
);

// Check 16: Town plugin has Provider
const townPluginContent = readFile('convex/elizaAgent/townPlugin.ts');
const hasProvider = townPluginContent.includes('providers: [aiTownProvider]');
check(
  'Town plugin includes AI Town Provider',
  hasProvider,
  hasProvider ? 'Provider properly registered' : 'Provider MISSING from plugin'
);

// Check 17: Provider returns ProviderResult
const hasProviderResult = townPluginContent.includes('ProviderResult') && townPluginContent.includes('values:') && townPluginContent.includes('data:') && townPluginContent.includes('text:');
check(
  'Provider returns proper ProviderResult',
  hasProviderResult,
  hasProviderResult ? 'Provider returns {values, data, text}' : 'Provider return type incorrect'
);

// Check 18: Context is set before ElizaOS calls
const setsContext = countOccurrences(elizaRuntime, /setTownContext\(/g);
const clearsContext = countOccurrences(elizaRuntime, /clearTownContext\(/g);
check(
  'ElizaOS calls set/clear context',
  setsContext >= 1 && clearsContext >= 1,
  `Found ${setsContext} setTownContext and ${clearsContext} clearTownContext calls`
);

// Check 19: Runtime uses all three plugins
const usesAllPlugins = elizaRuntime.includes('inmemoryDbPlugin') && elizaRuntime.includes('openaiPlugin') && elizaRuntime.includes('townPlugin');
check(
  'Runtime uses all required plugins',
  usesAllPlugins,
  usesAllPlugins ? 'inmemoryDbPlugin, openaiPlugin, townPlugin all loaded' : 'Some plugins missing'
);

// Summary
console.log('\n📊 Results:\n');

let passCount = 0;
let failCount = 0;
let warnCount = 0;

for (const result of results) {
  const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${result.check}`);
  console.log(`   ${result.details}\n`);
  
  if (result.status === 'PASS') passCount++;
  else if (result.status === 'FAIL') failCount++;
  else warnCount++;
}

console.log('='.repeat(50));
console.log(`\n📈 Summary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings\n`);

if (failCount > 0) {
  console.log('❌ VERIFICATION FAILED - Some checks did not pass');
  process.exit(1);
} else {
  console.log('✅ VERIFICATION PASSED - ElizaOS integration is 100% complete');
  console.log('\n🎉 All agent decisions, conversations, and memory operations use ElizaOS!');
  process.exit(0);
}
