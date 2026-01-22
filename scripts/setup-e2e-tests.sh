#!/bin/bash
# E2E Test Setup Script
# This script helps set up the environment for running E2E tests

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  AI Town E2E Test Setup                                          ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Check for Convex CLI
if ! command -v npx &> /dev/null; then
    echo "❌ npx not found. Please install Node.js first."
    exit 1
fi

# Check if already logged in to Convex
if [ -f ~/.convex/config.json ]; then
    echo "✓ Convex credentials found"
else
    echo "⚠️  Not logged in to Convex"
    echo ""
    echo "Please run: npx convex login"
    echo ""
    exit 1
fi

# Check for existing deployment
if [ -f .convex/deployment_state.json ]; then
    CONVEX_URL=$(grep -o '"deploymentUrl":"[^"]*' .convex/deployment_state.json | cut -d'"' -f4)
    echo "✓ Found existing deployment: $CONVEX_URL"
else
    echo "⚠️  No deployment found"
    echo ""
    echo "To create a deployment, run:"
    echo "  npx convex dev"
    echo ""
    echo "Then copy the URL to .env.test"
    exit 1
fi

# Create .env.test
echo "CONVEX_URL=$CONVEX_URL" > .env.test
echo "✓ Created .env.test with CONVEX_URL"

# Check for LLM
if [ -n "$OPENAI_API_KEY" ] || [ -n "$TOGETHER_API_KEY" ]; then
    echo "✓ LLM API key found in environment"
elif curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✓ Ollama detected on localhost:11434"
    echo "OLLAMA_HOST=http://localhost:11434" >> .env.test
else
    echo "⚠️  No LLM configured"
    echo "   Tests requiring LLM responses may timeout"
    echo ""
    echo "   Options:"
    echo "   1. Start Ollama: ollama serve"
    echo "   2. Set OPENAI_API_KEY in .env.test"
    echo "   3. Set TOGETHER_API_KEY in .env.test"
fi

echo ""
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Setup Complete!                                                 ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  To run tests:                                                   ║"
echo "║    npm run test:e2e           # Run all E2E tests               ║"
echo "║    npm run test:e2e:startup   # Startup & agent validation      ║"
echo "║    npm run test:e2e:world     # Run world tests only            ║"
echo "║    npm run test:e2e:agent     # Run agent tests only            ║"
echo "║    npm run test:e2e:full      # Full game loop tests            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
