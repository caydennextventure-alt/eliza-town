# Werewolf MVP — MCP Server Spec

This repo will include an MCP server that exposes the Werewolf tools described in:
- `specs/eliza-town-werewolf-mvp-mcp-spec.md`

The MCP server is a **thin adapter** that calls Convex.

## Transport

MVP default: **stdio** (best supported by MCP hosts).

Optional: Streamable HTTP transport can be added later.

## Tool contract

Tool names and JSON Schemas must be **identical** to the spec. Do not rename tools.

## Identity (“authenticated agent”)

The tool schemas do not include an agent/player identifier. Therefore, the MCP server must associate each connection with a caller identity.

MVP strategy (simple and effective for stdio):
- Run **one MCP server process per agent**.
- Provide the agent’s `playerId` via env var.

Required env vars:
- `ET_PLAYER_ID` — the Eliza Town game player id (e.g. `p:12`)
- `CONVEX_URL` — Convex deployment URL (can reuse `VITE_CONVEX_URL`)

If `ET_PLAYER_ID` is missing, treat the caller as a spectator (public-only).

## Convex function mapping

Create Convex queries/mutations under `convex/werewolf/*` and map them 1:1 to MCP tools:

- `et.werewolf.matches.list` → `api.werewolf.matchesList` (query)
- `et.werewolf.match.get_state` → `api.werewolf.matchGetState` (query)
- `et.werewolf.match.events.get` → `api.werewolf.matchEventsGet` (query)

- `et.werewolf.queue.join` → `api.werewolf.queueJoin` (mutation)
- `et.werewolf.queue.leave` → `api.werewolf.queueLeave` (mutation)
- `et.werewolf.queue.status` → `api.werewolf.queueStatus` (query)

- `et.werewolf.match.ready` → `api.werewolf.matchReady` (mutation)
- `et.werewolf.match.say_public` → `api.werewolf.matchSayPublic` (mutation)
- `et.werewolf.match.vote` → `api.werewolf.matchVote` (mutation)

- `et.werewolf.match.night.wolf_chat` → `api.werewolf.matchWolfChat` (mutation)
- `et.werewolf.match.night.wolf_kill` → `api.werewolf.matchWolfKill` (mutation)
- `et.werewolf.match.night.seer_inspect` → `api.werewolf.matchSeerInspect` (mutation)
- `et.werewolf.match.night.doctor_protect` → `api.werewolf.matchDoctorProtect` (mutation)

Convex args should include `playerId` (derived from env) when needed.

## Error handling

Each tool output must include:
- `ok: boolean`
- `serverTime: string` (ISO)
- `error: null | { code, message, retryable }`

When Convex throws, convert to this structure with stable `code` strings.

## Idempotency

Where the tool schema includes `idempotencyKey`, forward it to Convex and let Convex return the prior result if seen before.

## Implementation notes

- Use `@modelcontextprotocol/sdk` for server + stdio transport.
- Use `ConvexHttpClient` from the `convex` npm package.
- Add a root script (after implementation) like:
  - `npm run mcp:werewolf` → runs `node --loader ts-node/esm mcp/werewolf/server.ts`
