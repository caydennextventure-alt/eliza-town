# Testing

This repo uses Jest for unit tests and Playwright for E2E. E2E runs against a real local
Convex backend and a real ElizaOS server. No mock backend is used.

## Setup
- `npm install`
- `npx playwright install --with-deps`
- Set Convex env: `npx convex env set ELIZA_SERVER_URL "http://localhost:3000"` (or your ElizaCloud/Railway URL).
- (Optional) Set `E2E_ELIZA_SERVER_URL` and `E2E_ELIZA_AUTH_TOKEN` to auto-fill the Create Agent dialog in Playwright.
- Start ElizaOS in another terminal (see ElizaOS docs). Ensure `/api/agents` is reachable.
- (Optional) Configure LLMs for ElizaOS and the game engine (Ollama is the default in Convex).
- By default E2E uses a dedicated local Convex deployment on port 3212 (site port 3213) in anonymous mode (no prompts).
- The Werewolf E2E test reuses fixed agent names (`E2E Werewolf 1` - `E2E Werewolf 8`). First run creates them; later runs reuse. If your Eliza server requires manually starting agents, flip the switch for those 8 once.
- To print match events in Convex logs while running E2E, set `WEREWOLF_LOG_EVENTS=1`
  (passed envs are synced into the local Convex env when `dev:backend:e2e` starts).
- Add `WEREWOLF_LOG_PRIVATE=1` to include wolf chat/private narrator lines.

## Run
- Unit tests: `npm test`
- E2E (headless): `npm run test:e2e`
- E2E (UI runner): `npm run test:e2e:ui`
- E2E backend only: `npm run dev:backend:e2e` (local Convex + env sync + engine resume)
- E2E frontend only: `npm run dev:frontend:e2e` (Vite in e2e mode)
- E2E dev server only: `npm run dev:e2e` (serves `http://127.0.0.1:4173/ai-town/`, enables test UI helpers via `VITE_E2E=1`)
  - If you reuse an existing dev server, start it with `VITE_E2E=1` so the test controls are available.
- Override the E2E backend ports: `E2E_CONVEX_PORT=3214` (also set `E2E_CONVEX_SITE_PORT=3215`)

## Debug flags
- `VITE_E2E=1`: enable the in-app E2E test controls overlay.
- `VITE_SHOW_DEBUG_UI=1`: show debug UI (time manager + Werewolf spectator spoiler toggle).
- `WEREWOLF_LOG_EVENTS=1`: log Werewolf match events in Convex logs.
- `WEREWOLF_LOG_PRIVATE=1`: include private/wolf-chat lines in Werewolf logs.
- `WEREWOLF_ELIZA_CONCURRENCY=<n>`: limit concurrent Eliza calls during Werewolf rounds (default 4; E2E backend sets 2).
- `ELIZA_API_DEBUG=1` or `E2E_ELIZA_DEBUG=1`: log Eliza API requests/responses (includes curl payloads with redacted keys).
- `ELIZA_DISABLE_LEGACY=1` or `ELIZA_MESSAGING_ONLY=1`: skip legacy Eliza endpoints.
- `AITOWN_DISABLE_AGENT_OPERATIONS=1`: disable agent operations (useful for stabilizing E2E).
- `AITOWN_NOISY_LOGS=1` or `NOISY_LOGS=1`: enable noisy logging helpers.
- `LLM_LOGS=1`: log LLM requests/responses (also enabled by `AITOWN_NOISY_LOGS`).
- E2E harness knobs: `E2E_CONVEX_HOST`, `E2E_VITE_PORT`, `E2E_CONVEX_WAIT_TIMEOUT_MS`, `E2E_CONVEX_WAIT_INTERVAL_MS`,
  `CONVEX_FORCE_LATEST`, `CONVEX_LOCAL_BACKEND_VERSION`, `SKIP_CONVEX_WAIT`, `SKIP_CONVEX_RESUME`,
  `CONVEX_ENV_SYNC_TIMEOUT_MS`, `CONVEX_ENV_SYNC_INTERVAL_MS`, `CONVEX_RESUME_TIMEOUT_MS`, `CONVEX_RESUME_INTERVAL_MS`.

## E2E Coverage
- Landing page actions and help modal: `e2e/landing.spec.ts`
- Character creation/regeneration/deletion: `e2e/create-character.spec.ts`
- Agent creation/cancel: `e2e/create-agent.spec.ts`
- Join/release flows and empty-state CTAs: `e2e/join-world.spec.ts`
- Agent removal: `e2e/agent-list.spec.ts`
- Conversations (invite/accept/reject/message/leave): `e2e/conversation.spec.ts`
- Movement via test control overlay: `e2e/movement.spec.ts`
- Full Werewolf match (queue 8 agents, watch to completion): `e2e/werewolf-game.spec.ts`

Detailed mapping lives in `docs/e2e-coverage.md`.

## CI
Playwright runs on PRs via `.github/workflows/playwright.yml`.
