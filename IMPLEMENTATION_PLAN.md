# IMPLEMENTATION_PLAN — Werewolf MVP (Eliza Town)

This plan is an initial, repo-specific breakdown of the work required to implement the Werewolf MVP.

Rules:
- **One checkbox item = one Codex iteration = one commit.**
- Prefer **tests first**.
- Keep Convex functions thin; keep the “engine” logic pure + unit-tested.

---

## Milestone 0 — Repo scaffolding

- [x] Copy this RALPH pack into the repo root and commit docs (`AGENTS.md`, prompts, `specs/*`, `IMPLEMENTATION_PLAN.md`).

## Milestone 1 — Core domain + pure engine (TDD)

> Goal: deterministic match logic with great unit test coverage.

- [x] Add `convex/werewolf/types.ts` defining roles, phases, command types, and event types used by the engine.
  - Tests: `convex/werewolf/types.test.ts` (smoke: exhaustive enums, helper functions)

- [x] Add `convex/werewolf/engine/roleAssign.ts` with deterministic role assignment given 8 players.
  - Tests:
    - exactly 2 wolves, 1 seer, 1 doctor, 4 villagers
    - no duplicate roles per player

- [x] Add `convex/werewolf/engine/state.ts` with:
  - `createInitialMatchState(players, now)`
  - `computeRequiredAction(state, playerId)`
  - Tests: requiredAction per role per phase

- [x] Add `convex/werewolf/engine/transitions.ts` that advances phases on timer expiry:
  - LOBBY → NIGHT
  - NIGHT → DAY_ANNOUNCE
  - DAY_ANNOUNCE → DAY_OPENING → DAY_DISCUSSION → DAY_VOTE → DAY_RESOLUTION → NIGHT/ENDED
  - Tests: phase order, dayNumber/nightNumber increments, phaseEndsAt behavior

- [x] Add `convex/werewolf/engine/night.ts` implementing night action submission + resolution:
  - wolves select kill target (single shared selection)
  - doctor protects (no consecutive same target)
  - seer inspects (private result)
  - default wolf kill target when none provided by deadline
  - Tests: doctor protection prevents kill, seer history stored, default kill picks eligible non-wolf

- [x] Add `convex/werewolf/engine/day.ts` implementing:
  - opening statements: exactly one per alive player
  - public discussion (rate limiting not in pure engine)
  - vote casting + changing
  - vote resolution with tie/abstain behavior
  - Tests: tie → no elimination, majority → elimination, dead cannot vote

- [x] Add `convex/werewolf/engine/win.ts` implementing win-condition evaluation.
  - Tests: wolves win when wolves >= villagers alive; villagers win when wolves == 0

- [x] Add `convex/werewolf/engine/events.ts` defining canonical event payload shapes (public/private) emitted by engine.
  - Tests: emitted events on phase change, elimination, night result

## Milestone 2 — Convex persistence + scheduling

> Goal: store matches in Convex tables, expose queries/mutations for UI, and schedule phase advancement.

- [x] Add new tables and indexes to `convex/schema.ts` (see `specs/20-data-model.md`).
  - Validation: `npm run lint` (Convex schema compiles)

- [x] Create `convex/werewolf/db.ts` with helpers:
  - load match snapshot (match + players)
  - write state changes
  - append events with monotonic `seq`
  - Tests: in-memory helper tests where possible

- [x] Implement `api.werewolf.queueJoin` + `api.werewolf.queueLeave` + `api.werewolf.queueStatus`.
  - Behavior: join is idempotent; leaving removes entry; status returns position and match assignment if any.
  - Tests: unit tests for queue selection logic (pure function) + basic mutation argument validation
- [x] Reconcile Convex API module paths for werewolf functions (spec uses `api.werewolf.*` but code lives under `convex/werewolf/*`).

- [x] Implement match creation when queue reaches 8:
  - create `werewolfMatches` doc in LOBBY
  - create 8 `werewolfPlayers` docs w/ seats + roles
  - create `werewolfBuildings` marker
  - Tests: pure “create match from 8 queued players” function

- [x] Implement internal scheduler handler `internal.werewolf.advancePhase`:
  - checks expected phase + deadline
  - calls engine transition
  - persists state + events
  - re-schedules next phase
  - Tests: pure “advance” logic in engine already; add thin wrapper tests if feasible

- [x] Schedule initial phase advance job when a match starts (uses `internal.werewolf.advancePhase`).
- [x] Regenerate Convex API types for new werewolf internal functions and remove the `internal` type cast in the scheduler.

- [x] Implement `matchReady` + `matchSayPublic` mutations (constraints, events, state updates, happy-path tests).
- [x] Implement `matchVote` mutation (constraints, event, state updates, happy-path test).
- [x] Implement `matchWolfChat` mutation (constraints, event, state updates, happy-path test).
- [x] Implement `matchWolfKill` mutation (constraints, event, state updates, happy-path test).
- [x] Implement `matchSeerInspect` mutation (constraints, event, state updates, happy-path test).
- [x] Implement `matchDoctorProtect` mutation (constraints, event, state updates, happy-path test).

- [x] Implement match queries:
  - `matchesList`
  - `matchGetState` (public + caller-private filtering)
  - `matchEventsGet` (cursor by eventId/seq + visibility filtering)
  - Tests: visibility filtering (spectator vs player vs wolves)

- [x] Add idempotency storage (`werewolfIdempotency`) and wire it into tool-bearing mutations (`queueJoin`, `matchReady`, `matchVote`, night actions).
  - Tests: duplicate idempotencyKey returns same result, no duplicate events

## Milestone 3 — Frontend UI integration

> Goal: queue agents and watch matches in the existing Eliza Town UI.

- [x] Add a top-left HUD button (near `WorldJoinControls`) that opens `WerewolfPanel`.
  - Files: `src/App.tsx`, `src/components/werewolf/WerewolfPanel.tsx`

- [x] Implement Queue tab UI:
  - list owned custom agents
  - show queue status and join/leave buttons
  - Validation: manual UI sanity check in browser

- [x] Implement Matches tab UI: list active matches.

- [x] Implement SpectatorPanel:
  - phase timer
  - roster with revealed roles for dead
  - transcript
  - vote tally during DAY_VOTE
  - key moments (minimal viable)

- [x] Implement Matches tab "Watch" action to open SpectatorPanel.

- [x] Implement teleport button:
  - uses building marker `(x,y)` to move the human player

- [x] Render map markers for active match buildings:
  - query buildings in world
  - Pixi overlay markers
  - click marker opens spectator panel

## Milestone 4 — MCP server

> Goal: allow AI agents to play via the MCP tools.

- [x] Add MCP server skeleton under `mcp/werewolf/*` using `@modelcontextprotocol/sdk` with stdio transport.
  - Script: `npm run mcp:werewolf`

- [x] Register all tools exactly as in `specs/eliza-town-werewolf-mvp-mcp-spec.md`.
  - Validation: tool list matches names, input schemas, output schemas

- [x] Add the missing `et.werewolf.queue.status` tool to the MCP spec + tool registry, and add a test to keep the registry in sync.

- [x] Implement tool handlers that call Convex via `ConvexHttpClient`.
  - Uses env vars: `CONVEX_URL`, `ET_PLAYER_ID`
  - Tests: unit test dispatch for at least 3 tools (queue.join, match.get_state, match.vote)

- [x] Add schema-conformance tests for MCP tool outputs (AJV).
  - Start with `match.get_state` and `match.events.get`
- [x] Add AJV schema-conformance test for `et.werewolf.queue.join` tool output.
- [x] Add AJV schema-conformance test for `et.werewolf.queue.status` tool output.
- [x] Add AJV schema-conformance test for `et.werewolf.queue.leave` tool output.

## Milestone 5 — MVP polish + reliability

- [x] Add rate limiting for public chat and wolf chat (per spec guidance) + tests.
- [x] Improve narrator messages and “publicSummary” updates (deterministic templates).
- [x] Add a minimal admin/dev panel toggle to show “spoiler mode” in UI.
- [x] Write a short manual runbook in `specs/60-runbook.md` for demoing the MVP.
- [x] Add early phase advance when all alive players have cast votes (DAY_VOTE), with immediate scheduler trigger + tests.
- [x] Add early phase advance when all players are ready in LOBBY, with scheduler trigger + tests.
- [x] Add early phase advance when all alive players have posted openings in DAY_OPENING, with scheduler trigger + tests.
- [x] Enhance spectator key moments with seer claims/counterclaims, top accusations, and vote-flip contradictions (heuristics + tests).

## Milestone 6 — Spec alignment

- [x] Align MCP spec integration notes with the current data model (messages stored in `werewolfEvents`, no separate `werewolfMessages` table).
- [x] Add MCP read-tool rate limiting (match.get_state, match.events.get) to 2 calls/sec per connection + tests.
- [x] Align MCP spec common data types and matchId descriptions with Convex ID strings (non-UUID).
