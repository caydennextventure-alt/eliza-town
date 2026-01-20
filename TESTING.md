# Testing

This repo uses Jest for unit tests and Playwright for E2E. E2E runs against a deterministic
mock Convex backend (no external services) and uses `VITE_E2E_MOCKS=1` to enable mocks.

## Setup
- `npm install`
- `npx playwright install --with-deps`

## Run
- Unit tests: `npm test`
- E2E (headless): `npm run test:e2e`
- E2E (UI runner): `npm run test:e2e:ui`
- E2E dev server only: `npm run dev:e2e` (serves `http://127.0.0.1:4173/ai-town/`)

## E2E Coverage
- Landing page actions and help modal: `e2e/landing.spec.ts`
- Character creation/regeneration/deletion: `e2e/create-character.spec.ts`
- Agent creation/cancel: `e2e/create-agent.spec.ts`
- Join/release flows and empty-state CTAs: `e2e/join-world.spec.ts`
- Agent removal: `e2e/agent-list.spec.ts`
- Conversations (invite/accept/reject/message/leave): `e2e/conversation.spec.ts`
- Movement via mock control: `e2e/movement.spec.ts`

Detailed mapping lives in `docs/e2e-coverage.md`.

## CI
Playwright runs on PRs via `.github/workflows/playwright.yml`.
