# AGENTS.md (Eliza Town)

This file is **operational only**: how to run, build, and validate this repo.

## Install

```bash
npm install
```

## Run (local dev)

> Starts Convex + Vite (see `package.json`).

```bash
npm run dev
```

Optional: seed default agents during init by setting `AUTO_SPAWN_AGENTS`.
- `AUTO_SPAWN_AGENTS=1 npm run dev` (spawns full default set)
- `AUTO_SPAWN_AGENTS=5 npm run dev` (spawns 5 defaults)

## Validation (run after every change)

```bash
npm run lint
npm run test
```

Optional typecheck (if you want it separate from lint):

```bash
npx tsc -p tsconfig.json --noEmit
```

## Repo conventions (important for new code)

- **Backend** is Convex: add functions under `convex/*` and update `convex/schema.ts` for new tables.
- Prefer **pure TypeScript modules** for game logic with Jest unit tests (fast, deterministic). Keep Convex mutations thin wrappers.
- Prefer **append-only event logs** for UI/agent consumption (`werewolfEvents`) + derived “current state” fields in `werewolfMatches`/`werewolfPlayers`.
- Keep IDs as strings that are stable and easy to index (Convex doc IDs are acceptable).

## Werewolf MVP (expected locations)

- Convex: `convex/werewolf/*`
- UI: `src/components/werewolf/*`
- Optional MCP server: `mcp/werewolf/*` (Node + `@modelcontextprotocol/sdk`)
