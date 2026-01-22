# AI Town E2E Tests

End-to-end tests for the AI Town game backend. These tests use **real APIs** with **no mocks** - they test the actual game with actual LLM calls.

## Prerequisites

1. **Convex Deployment**: You need a running Convex deployment
2. **LLM Service**: Ollama (local), OpenAI, or Together.ai

## Setup

### 1. Start Convex Development Server

```bash
npx convex dev
```

This will:
- Create a new Convex deployment (if first time)
- Initialize the world with default agents
- Start the game engine

Copy the deployment URL (e.g., `https://happy-animal-123.convex.cloud`).

### 2. Configure Environment

```bash
# Copy the example config
cp .env.test.example .env.test

# Edit and add your Convex URL
echo "CONVEX_URL=https://your-deployment.convex.cloud" > .env.test
```

### 3. Configure LLM (Optional)

The game uses Ollama by default. If you have Ollama running locally on port 11434, no additional configuration is needed.

For OpenAI or other providers, add to `.env.test`:

```bash
# For OpenAI
OPENAI_API_KEY=sk-...

# For Together.ai
TOGETHER_API_KEY=...
```

### 4. Start Ollama (if using local LLM)

```bash
# Start Ollama
ollama serve

# Pull the required model (in another terminal)
ollama pull llama3
ollama pull mxbai-embed-large
```

## Running Tests

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Specific Test Files

```bash
# Startup validation tests (validates game starts with agents)
npm run test:e2e:startup

# World initialization tests (fastest)
npm run test:e2e:world

# Agent creation/removal tests
npm run test:e2e:agent

# Conversation flow tests (requires LLM)
npm run test:e2e:conversation

# Full game tests (longest)
npm run test:e2e:full

# ElizaOS runtime tests
npm run test:e2e:eliza
```

## Test Categories

### Startup Tests (`startup.e2e.test.ts`)
- Game initialization with default agents
- Validates 5 default characters spawn
- Agent descriptions and identities
- Engine running state
- Agent activity monitoring
- World state consistency

**Duration**: ~2 minutes

### World Tests (`world.e2e.test.ts`)
- World initialization
- Engine start/stop/resume
- Agent spawning
- Map and description validation

**Duration**: ~30 seconds

### Agent Tests (`agent.e2e.test.ts`)
- Custom agent creation
- Agent removal
- Agent state validation
- Position and facing direction checks

**Duration**: ~1 minute

### Conversation Tests (`conversation.e2e.test.ts`)
- Autonomous conversation initiation
- Message generation (requires LLM)
- Conversation state transitions
- Typing indicators

**Duration**: ~3-5 minutes (depends on LLM)

### Full Game Tests (`full-game.e2e.test.ts`)
- Game state evolution over time
- Agent movement monitoring
- Engine stability
- Data integrity checks

**Duration**: ~3-5 minutes

### ElizaOS Tests (`eliza-runtime.e2e.test.ts`, `eliza-convex-integration.e2e.test.ts`)
- ElizaOS AgentRuntime initialization
- Message processing through messageService
- Action execution (MOVE, SAY, CONVERSE)
- Context providers (TOWN_STATE, ROOM_MESSAGES)
- Error handling

**Duration**: ~2-5 minutes (requires LLM API key)

## Timeouts

Tests have extended timeouts because they involve:
- Real LLM API calls (can take 10-30 seconds)
- Waiting for autonomous agent behavior
- Polling for state changes

Individual test timeouts:
- Default: 5 minutes (300000ms)
- Conversation tests: up to 5 minutes per test
- Full game tests: up to 2 minutes per test

## Troubleshooting

### "CONVEX_URL environment variable is required"

Make sure you have a `.env.test` file with your Convex URL:

```bash
echo "CONVEX_URL=https://your-deployment.convex.cloud" > .env.test
```

### Tests timeout waiting for conversations

This usually means:
1. LLM is not responding (check Ollama is running)
2. Agents are doing activities instead of conversing
3. Network latency is high

Try:
```bash
# Check if Ollama is responding
curl http://localhost:11434/api/tags

# Check Convex logs
npx convex logs
```

### "No default world found"

Run the initialization:
```bash
npx convex dev --run init
```

### LLM errors in Convex logs

Make sure you've configured the correct LLM in Convex environment:
```bash
# For OpenAI
npx convex env set OPENAI_API_KEY sk-...

# For Ollama (usually automatic)
npx convex env set OLLAMA_HOST http://host.docker.internal:11434
```

## Architecture

```
tests/e2e/
├── setup.ts                    # Jest setup, env validation
├── helpers/
│   ├── client.ts               # Convex HTTP client wrapper
│   ├── wait.ts                 # Polling/waiting utilities
│   ├── assertions.ts           # Custom assertions
│   └── index.ts                # Re-exports
├── startup.e2e.test.ts         # Startup & default agent tests
├── world.e2e.test.ts           # World/engine tests
├── agent.e2e.test.ts           # Agent lifecycle tests
├── conversation.e2e.test.ts    # Conversation tests
├── full-game.e2e.test.ts       # Full integration tests
├── infrastructure.e2e.test.ts  # Test infrastructure validation
├── eliza-runtime.e2e.test.ts   # ElizaOS runtime tests
└── eliza-convex-integration.e2e.test.ts  # ElizaOS + Convex tests
```

## CI Integration

For GitHub Actions, add these secrets:
- `CONVEX_DEPLOY_KEY`: From Convex dashboard
- `OPENAI_API_KEY`: If using OpenAI

Example workflow:

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      
      - name: Deploy to Convex
        run: npx convex deploy --cmd 'npm run build'
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
      
      - name: Run E2E Tests
        run: npm run test:e2e
        env:
          CONVEX_URL: ${{ secrets.CONVEX_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```
