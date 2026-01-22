/**
 * E2E Test Setup
 * 
 * This file runs before all E2E tests and sets up the test environment.
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables from .env.test or .env
config({ path: path.resolve(process.cwd(), '.env.test') });
config({ path: path.resolve(process.cwd(), '.env') });

// Check for Convex URL (required for Convex tests, optional for Eliza-only tests)
const hasConvex = !!process.env.CONVEX_URL;

// Check for LLM/Eliza configuration
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const hasGroq = !!process.env.GROQ_API_KEY;
const hasTogether = !!process.env.TOGETHER_API_KEY;
const hasOllama = !!process.env.OLLAMA_HOST;
const hasElizaServer = !!process.env.ELIZA_SERVER_URL;

const hasLLM = hasOpenAI || hasAnthropic || hasGroq || hasTogether || hasOllama;

// Determine active provider
let activeProvider = 'none';
if (hasOpenAI) activeProvider = 'OpenAI';
else if (hasAnthropic) activeProvider = 'Anthropic';
else if (hasGroq) activeProvider = 'Groq';
else if (hasTogether) activeProvider = 'Together.ai';
else if (hasOllama) activeProvider = 'Ollama';

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  E2E Test Environment                                            ║
╠══════════════════════════════════════════════════════════════════╣
║  CONVEX_URL: ${(process.env.CONVEX_URL || 'not set').substring(0, 48).padEnd(48)}║
║  LLM Provider: ${activeProvider.padEnd(46)}║
║  Eliza Server: ${(hasElizaServer ? process.env.ELIZA_SERVER_URL!.substring(0, 44) : 'not set').padEnd(46)}║
╚══════════════════════════════════════════════════════════════════╝
`);

if (!hasLLM) {
  console.warn(`
╔══════════════════════════════════════════════════════════════════╗
║  Warning: No LLM API key detected                                ║
╠══════════════════════════════════════════════════════════════════╣
║  ElizaOS runtime tests will be SKIPPED without an API key.       ║
║                                                                  ║
║  Set one of these for REAL Eliza agent tests:                    ║
║    - OPENAI_API_KEY       (recommended)                          ║
║    - ANTHROPIC_API_KEY    (Claude models)                        ║
║    - GROQ_API_KEY         (fast inference)                       ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

if (!hasConvex) {
  console.warn(`
╔══════════════════════════════════════════════════════════════════╗
║  Warning: No CONVEX_URL set                                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Convex backend tests will FAIL without a deployment URL.        ║
║                                                                  ║
║  To set up:                                                      ║
║    1. npx convex login                                           ║
║    2. npx convex dev                                             ║
║    3. echo "CONVEX_URL=https://..." > .env.test                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

// Note: Jest timeout is configured in jest.e2e.config.ts (testTimeout: 300000)
