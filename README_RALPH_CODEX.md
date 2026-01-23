# Eliza Town Werewolf MVP — RALPH x Codex CLI Pack

This pack is a **ready-to-commit** set of markdown artifacts for running the **RALPH methodology** with **OpenAI Codex CLI** to implement the *Werewolf MVP* inside the existing **Eliza Town** codebase.

The core idea:
- **Planning mode** keeps `IMPLEMENTATION_PLAN.md` accurate.
- **Build mode** implements exactly **one** plan item per iteration (TDD-first), runs validation, updates the plan, and commits.

---

## Contents

- `AGENTS.md` — operational commands for build/test/lint + repo conventions (kept short)
- `PROMPT_plan.md` — planning prompt (gap analysis → update `IMPLEMENTATION_PLAN.md`)
- `PROMPT_build.md` — building prompt (execute the next task in `IMPLEMENTATION_PLAN.md`)
- `IMPLEMENTATION_PLAN.md` — an initial, repo-specific milestone plan (TDD oriented)
- `specs/` — implementation specification for Werewolf MVP (tailored to the current codebase)
- `LOOP.md` — a Codex-oriented loop script template (copy-paste into `loop.sh` if desired)

---

## How to use in your repo

1. Copy these files into the **repo root** (same folder as `package.json`).
2. Ensure the repo has a `specs/` directory at the root (create if missing) and copy the `specs/*` files.
3. Commit the docs first (recommended).

---

## Codex CLI “RALPH loop” commands

> These examples use `codex exec` so Codex finishes a run without requiring interactive TUI input.

### Planning mode

```bash
cat PROMPT_plan.md | codex exec --full-auto -
```

### Build mode (repeat per iteration)

```bash
cat PROMPT_build.md | codex exec --full-auto -
```

### Optional: JSON event stream (better logging)

```bash
cat PROMPT_build.md | codex exec --full-auto --json -
```

### Optional: resume the last session (same workspace)

```bash
codex exec resume --last --full-auto -
```

---

## Authentication quick notes

In headless environments:

```bash
codex login --device-auth
```

Or API key auth:

```bash
printenv OPENAI_API_KEY | codex login --with-api-key
```

---

## Branching + iteration discipline

Recommended:
- Work on a feature branch, e.g. `feat/werewolf-mvp`.
- Each iteration produces:
  - **one** small unit of work,
  - a passing test/validation run,
  - an update to `IMPLEMENTATION_PLAN.md` (mark done / add discoveries),
  - a clean commit.

---

## Where the Werewolf work lands

The implementation plan assumes:
- Convex backend code under `convex/werewolf/*`.
- React UI under `src/components/werewolf/*` (or similar).
- An optional Node MCP server under `mcp/werewolf/*` (thin layer over Convex HTTP client).

