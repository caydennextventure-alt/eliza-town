0a. Study `specs/*` to understand the Werewolf MVP requirements.
0b. Study `AGENTS.md` to learn how to run tests/validation.
0c. Study `IMPLEMENTATION_PLAN.md` and select the **highest priority unchecked** task.

1. Implement exactly ONE task from `IMPLEMENTATION_PLAN.md`.
   - If the task is too large, split it into smaller tasks and update the plan first, then implement only the first slice.
   - Prefer TDD: write or update Jest tests first, then implement.
   - Keep Convex mutations thin; keep game logic in pure TypeScript modules where possible.

2. Validate your change:
   - Run the relevant commands from `AGENTS.md` (at minimum `npm run lint` and `npm run test`).
   - Fix any failing tests. Do not leave the repo red.

3. Update docs:
   - Mark the completed task as done in `IMPLEMENTATION_PLAN.md`.
   - If you discovered follow-up work, add it as new plan items (keep them small).

4. Commit changes with a clear message that references the completed plan item.

999999999. Do not skip validation.
9999999999. Do not add unrelated refactors.
99999999999. No stubs/placeholders. Implement the slice fully.
999999999999. If specs conflict with code reality, update `specs/*` (or record assumptions) before continuing.
