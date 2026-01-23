# Optional: loop script for Codex CLI (RALPH)

This project uses the RALPH “outer loop” idea: **one task per iteration**.

If you want an executable loop, copy the script below into `loop.sh` in your repo root and make it executable.

## `loop.sh` template

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./loop.sh                # build mode, unlimited iterations
#   ./loop.sh plan           # plan mode, unlimited iterations
#   ./loop.sh 10             # build mode, max 10 iterations
#   ./loop.sh plan 3         # plan mode, max 3 iterations

MODE="build"
MAX_ITERATIONS=0

if [[ "${1:-}" == "plan" ]]; then
  MODE="plan"
  shift
fi

if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
  MAX_ITERATIONS="$1"
  shift
fi

PROMPT_FILE="PROMPT_build.md"
if [[ "$MODE" == "plan" ]]; then
  PROMPT_FILE="PROMPT_plan.md"
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: $PROMPT_FILE not found"
  exit 1
fi

ITERATION=0
CURRENT_BRANCH=$(git branch --show-current)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Mode:   $MODE"
echo "Prompt: $PROMPT_FILE"
echo "Branch: $CURRENT_BRANCH"
if [[ "$MAX_ITERATIONS" -gt 0 ]]; then
  echo "Max:    $MAX_ITERATIONS iterations"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

while true; do
  if [[ "$MAX_ITERATIONS" -gt 0 && "$ITERATION" -ge "$MAX_ITERATIONS" ]]; then
    echo "Reached max iterations: $MAX_ITERATIONS"
    break
  fi

  # Use Codex in non-interactive mode.
  # --full-auto: workspace-write sandbox + on-request approvals (low-friction but not YOLO)
  # --json: emit newline-delimited JSON events (better logs)
  cat "$PROMPT_FILE" | codex exec --full-auto --json -

  # Push after each iteration (optional but recommended)
  git push origin "$CURRENT_BRANCH" || git push -u origin "$CURRENT_BRANCH"

  ITERATION=$((ITERATION + 1))
  echo -e "\n\n======================== LOOP $ITERATION ========================\n"
done
```

## Notes

- If you truly need **zero approvals**, Codex supports bypass flags, but **only use that inside an isolated runner**.
- If you hit a situation where Codex stops for interaction anyway, rerun the loop after resolving locally.
