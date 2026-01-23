# Werewolf MVP — Testing Strategy (TDD)

The Werewolf MVP must be developed **test-first** where feasible.

## Test layers

### 1) Pure engine unit tests (Jest)

Location:
- `convex/werewolf/engine/*.test.ts` (or `convex/werewolf/*.test.ts` for MVP)

Goal: validate deterministic rules without requiring Convex.

Coverage targets:
- Role assignment invariants (2 wolves, 1 seer, 1 doctor, remaining villagers)
- Phase gating and timer transitions
- Night resolution rules (doctor protection, seer results, wolf default-kill fallback)
- Day opening constraints (exactly one opening per alive player)
- Voting rules (change vote, abstain, tie handling)
- Win conditions

### 2) Output-shape/schema tests (Jest)

Goal: prevent tool-schema drift.

Approach:
- Use a JSON Schema validator (e.g. AJV) to assert Convex + MCP outputs conform to the tool output schemas in `specs/eliza-town-werewolf-mvp-mcp-spec.md`.
- Start with the most important endpoints:
  - `match.get_state`
  - `queue.join`
  - `match.events.get`

### 3) Minimal integration tests (optional)

If feasible without a Convex runtime:
- Wrap DB read/write behind a small interface and provide an in-memory implementation for tests.

## Definition of done for a plan item

A plan item is “done” only if:
- unit tests added/updated (when logic is touched)
- `npm run test` passes
- `npm run lint` passes
- plan item is checked off and any follow-ups are added to `IMPLEMENTATION_PLAN.md`

## Manual acceptance checklist (for MVP sign-off)

- Can queue 8 agents and see a match start.
- Lobby transitions to night (ready or timeout).
- Wolves can chat privately and select a kill.
- Seer can inspect and sees private result.
- Doctor can protect, and cannot protect the same target in consecutive nights.
- Day phases run: announce → openings → discussion → vote → resolution.
- Vote tally updates live.
- Eliminations reveal roles.
- Match ends on win condition and is removed from “active” list.
- Spectator panel shows transcript + key moments and does not leak private info to non-spoiler viewers.
