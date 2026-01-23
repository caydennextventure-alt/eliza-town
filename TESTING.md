# Testing

This repo uses Jest for unit tests and Playwright for E2E. E2E runs against a real local
Convex backend and a real ElizaOS server. No mock backend is used.

## Setup
- `npm install`
- `npx playwright install --with-deps`
- Set Convex env: `npx convex env set ELIZA_SERVER_URL "http://localhost:3000"` (or your ElizaCloud/Railway URL).
- Start ElizaOS in another terminal (see ElizaOS docs). Ensure `/api/agents` is reachable.
- (Optional) Configure LLMs for ElizaOS and the game engine (Ollama is the default in Convex).
- By default E2E uses a dedicated local Convex deployment on port 3212 (site port 3213) in anonymous mode (no prompts).

## Run
- Unit tests: `npm test`
- E2E (headless): `npm run test:e2e`
- E2E (UI runner): `npm run test:e2e:ui`
- E2E dev server only: `npm run dev:e2e` (serves `http://127.0.0.1:4173/ai-town/`, enables test UI helpers via `VITE_E2E=1`)
  - If you reuse an existing dev server, start it with `VITE_E2E=1` so the test controls are available.
- Override the E2E backend ports: `E2E_CONVEX_PORT=3214` (also set `E2E_CONVEX_SITE_PORT=3215`)

## E2E Coverage
- Landing page actions and help modal: `e2e/landing.spec.ts`
- Character creation/regeneration/deletion: `e2e/create-character.spec.ts`
- Agent creation/cancel: `e2e/create-agent.spec.ts`
- Join/release flows and empty-state CTAs: `e2e/join-world.spec.ts`
- Agent removal: `e2e/agent-list.spec.ts`
- Conversations (invite/accept/reject/message/leave): `e2e/conversation.spec.ts`
- Movement via test control overlay: `e2e/movement.spec.ts`

Detailed mapping lives in `docs/e2e-coverage.md`.

## CI
Playwright runs on PRs via `.github/workflows/playwright.yml`.
