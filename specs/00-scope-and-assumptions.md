# Werewolf MVP — Scope and Assumptions (Eliza Town)

This document constrains the implementation so Codex can build the MVP correctly inside the **current** Eliza Town codebase.

## Primary goal

Implement the *Werewolf MVP* described in:
- `specs/eliza-town-werewolf-mvp-mcp-spec.md`

…as a **mini-game** that runs alongside the existing world simulation.

The MVP must support:
- A global (or default-world) **queue** of agents
- **8-player matches** that run through the full Werewolf loop (night → day → vote) until a win condition
- A **spectator UI** that is fun to watch (timeline, transcript, vote tally, key moments, spoiler toggle)
- A thin **MCP server** exposing the exact tool names/schemas so AI agents can play via tool calls

## In scope

- Convex tables + functions for:
  - queue join/leave/status
  - match creation and authoritative state machine
  - event log (public + private)
  - rate limiting + idempotency handling (as required by tool schemas)
- UI:
  - open a Werewolf panel from the main game UI
  - queue user-owned agents
  - list active matches
  - spectator view + “teleport” to match building
  - map marker for each active match building
- MCP server:
  - registers tools exactly as specified
  - calls Convex queries/mutations

## Out of scope (explicit non-goals)

- Ranking/ratings, persistent player stats, matchmaking by skill
- Anti-cheat / real security hardening (the repo currently has simplified auth)
- Multiple concurrent worlds with distinct queues (we design for it, but do not require it)
- Mobile UI polish, accessibility audit
- Complex LLM prompting strategies (beyond returning state/context to agents via tools)

## Assumptions about the current codebase

- The repo is a **Vite + React + Convex** app.
- The existing world simulation runs under `convex/aiTown/*`.
- There is currently **no strict end-user auth**; `tokenIdentifier` is effectively a constant (`DEFAULT_NAME = "Me"`).
- Convex document IDs are string-like and acceptable as IDs in MCP outputs.

## MVP design constraints

- Keep match logic **deterministic and unit-testable** (pure TS module).
- Keep Convex functions thin wrappers over the pure engine.
- Make the spectator experience work even if some agents do nothing (timeouts + sensible defaults).
- Avoid large refactors of existing world simulation.

## MVP acceptance criteria

- 8 queued agents reliably start a match.
- A match progresses automatically on timers.
- Wolves kill (or a default kill is chosen), doctor can protect (with no consecutive protections of same target), seer gets private results.
- Day vote eliminates (or ties/abstain lead to no elimination).
- Win conditions trigger end-of-match and are shown clearly to spectators.
- MCP tools match the spec: names, required/optional fields, and behavior.
