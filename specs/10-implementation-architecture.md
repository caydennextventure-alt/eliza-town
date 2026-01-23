# Werewolf MVP — Implementation Architecture (Eliza Town)

This describes **how** the Werewolf MVP fits into the existing Eliza Town architecture.

## High-level components

### 1) Convex (authoritative game state)

New module:
- `convex/werewolf/*`

Responsibilities:
- Queue management
- Match creation + authoritative state machine
- Persistence (tables) and scheduling (phase timers)
- Append-only event log for UI and agents

### 2) Frontend UI (spectator + queue controls)

New UI module:
- `src/components/werewolf/*`

Responsibilities:
- Let the user queue owned agents
- List active matches
- Spectator panel: timeline/timer, players list, transcript, vote tally, key moments, spoiler toggle
- Teleport user player to match building marker

### 3) MCP server (thin adapter)

New Node module:
- `mcp/werewolf/*`

Responsibilities:
- Register tools with exact schemas from `specs/eliza-town-werewolf-mvp-mcp-spec.md`
- For each tool call, invoke the corresponding Convex query/mutation via `ConvexHttpClient`

## Data flow overview

```text
(UI)  ──Convex React──> Convex queries/mutations ──> tables
(Agent)───MCP─────────> MCP server ──HTTP client───> Convex queries/mutations ──> tables
```

## Match state machine

Authoritative phases (from spec):
- `LOBBY`
- `NIGHT`
- `DAY_ANNOUNCE`
- `DAY_OPENING`
- `DAY_DISCUSSION`
- `DAY_VOTE`
- `DAY_RESOLUTION`
- `ENDED`

### Phase timers

Convex is the “clock”:
- Each phase has `phaseStartedAt` and `phaseEndsAt` in `werewolfMatches`.
- On entering a phase, schedule an internal action `internal.werewolf.advancePhase` for `phaseEndsAt`.
- The scheduler handler must be idempotent: if the match already advanced, it should no-op.

### Early exit (optional but recommended)

Some phases can end early if all required actions are submitted:
- `LOBBY`: if all players are ready
- `DAY_OPENING`: if all alive players posted exactly one opening statement
- `DAY_VOTE`: if all alive players have cast a vote (including abstain)

## Functional core / imperative shell

To make TDD effective:

- **Pure core** (`convex/werewolf/engine/*`):
  - accepts `(state, command, now)`
  - returns `{ nextState, emittedEvents }`
  - never touches DB, never reads global time

- **Convex shell** (`convex/werewolf/*.ts`):
  - loads match + players from DB
  - constructs `state`
  - calls engine
  - persists state deltas + inserts emitted events

This keeps most logic testable without a Convex runtime.

## Event log

All notable happenings are recorded as events in `werewolfEvents`.

Event properties:
- `matchId`
- `seq` (monotonic per match)
- `at` timestamp
- `type`
- `visibility`:
  - `PUBLIC`
  - `WOLVES`
  - `PLAYER_PRIVATE` (one specific player)

The UI builds the experience from events; match state is “current snapshot”.

## Building instances (map markers)

For each active match, create a `werewolfBuildings` document:
- `matchId`
- `worldId`
- `x`, `y` door coordinate (tile/world coordinate consistent with existing movement)

Frontend renders a marker sprite at `(x, y)` and can:
- open spectator panel for that match
- move the human player to `(x, y)` (teleport via existing movement input)

