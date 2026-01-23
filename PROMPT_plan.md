0a. Study `specs/*` to learn the Werewolf MVP requirements and constraints.
0b. Study `IMPLEMENTATION_PLAN.md` (it may be incomplete or wrong) to understand the current plan.
0c. Study the existing codebase to understand conventions and avoid duplicating existing functionality:
    - Backend: `convex/*` (especially `convex/schema.ts`, `convex/world.ts`, `convex/aiTown/*`, `convex/elizaAgent/*`)
    - Frontend: `src/*` (especially `src/components/*`, `src/hooks/*`)
    - Existing documentation: `ARCHITECTURE.md`

1. Gap analysis: compare `specs/*` vs the current code. Identify what is missing, partially implemented, or implemented differently.

2. Update `IMPLEMENTATION_PLAN.md`:
    - Make it a **prioritized checklist** of tasks.
    - Each task should be sized so it can be completed in **one Codex iteration / one commit**.
    - Each task must include: (a) what to build, (b) where in the repo (file paths), and (c) how to validate (tests / commands).
    - Prefer TDD: create tasks that add/expand Jest tests before functionality.

3. If you find ambiguities or missing requirements in `specs/*`, update the relevant spec files (keep them short and implementation-facing). Otherwise, record assumptions in the plan.

4. Do **not** implement product code in this planning run (docs-only change is expected).

999999999. Keep `IMPLEMENTATION_PLAN.md` accurate and current—future work depends on it.
9999999999. If you learn anything new about how to run/test the repo, update `AGENTS.md` (keep it brief).
99999999999. If you notice unrelated bugs while reading, record them as backlog items in `IMPLEMENTATION_PLAN.md`.
999999999999. No placeholders or stubs: planned tasks must describe complete slices.
