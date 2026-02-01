---
name: eliza-town-e2e-video
version: 0.1
purpose: Record an end-to-end Eliza Town demo video from a local dev environment (Convex + Vite + Playwright) and export to an X-ready MP4.
audience: X (Twitter)
---

# How I created the Eliza Town demo video (install → finished MP4)

This is a **verified, working** recipe (I re-ran it end‑to‑end) to generate an Eliza Town demo video from a local dev environment using Playwright.

It’s optimized for:
- **repeatable capture** (same flow every time)
- **X-friendly output** (MP4)

---

## 0) What you get
- A deterministic “demo flow” executed by Playwright (enter world → create character → create/connect agent → takeover → open/close panel)
- A recorded browser run (Playwright `.webm`)
- A final **MP4** you can upload to X

---

## 1) Prereqs (install)

### System
- Node.js (project uses Node tooling)
- Git

### Project dependencies
From the repo root:
```bash
npm install
```

### Playwright (browsers)
```bash
npx playwright install
```

### ffmpeg (for MP4 export)
macOS:
```bash
brew install ffmpeg
```

---

## 2) The key idea: record the demo as a Playwright test
Instead of manual screen recording, we let Playwright:
- drive the UI
- record video automatically

This creates:
- `test-results/**/video.webm`

You then convert to MP4.

---

## 3) Run the local backend + frontend

⚠️ **Branch note:** the automated demo-video flow relies on Playwright E2E scripts/config. If you don’t see an `e2e/` folder and Playwright config in your checkout, you’re on a branch that doesn’t include the video runner yet.

### Option A (recommended): use the repo’s E2E dev scripts (if present)
From the repo root:
```bash
npm run dev:backend:e2e
E2E_VITE_PORT=5173 npm run dev:frontend:e2e
```

### Option B: run the normal dev stack
From the repo root:
```bash
npm run dev
```

You should have the game available at something like:
- `http://localhost:5173/ai-town`

---

## 4) The demo test (Playwright)

### 4.1 The spec file
This approach assumes you have a “demo video” Playwright spec in your repo (example names we used during development):
- `e2e/bounty-demo-dev-ui.spec.ts`

If you don’t have it in your checkout, you’ll need to:
- switch to the branch that contains the demo-video runner, or
- add your own Playwright spec that performs the same flow.

### 4.2 Run just that test
Example command:
```bash
npx playwright test e2e/bounty-demo-dev-ui.spec.ts \
  --config playwright.bounty.config.ts \
  --reporter=line
```

On success, Playwright writes the recording to:
- `test-results/**/video.webm`

---

## 5) Convert WebM → MP4 (X-ready)
X accepts WebM in some cases, but MP4 is safest.

Convert with ffmpeg:
```bash
ffmpeg -y \
  -i test-results/<your-run>/video.webm \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 23 \
  -movflags +faststart \
  -an \
  /private/tmp/eliza-town-demo.mp4
```

Result:
- `/private/tmp/eliza-town-demo.mp4`

### Optional: crop or resize for better X engagement
(Example: force 1280 wide)
```bash
ffmpeg -y -i video.webm \
  -vf "scale=1280:-2" \
  -c:v libx264 -pix_fmt yuv420p -crf 23 \
  -c:a aac -b:a 128k \
  demo-1280.mp4
```

---

## 6) Common failure modes (and fixes)

### “Not logged in” during agent creation
If your backend requires a human auth identity, Playwright won’t be able to create agents unless:
- you enable a dev/anonymous mode, or
- you provide a test identity, or
- you change the flow to not require auth for demo creation.

This is exactly why we’ve been discussing **agent-first onboarding**.

### UI selectors breaking
Prefer **`data-testid`** attributes for automation stability.

---

## 7) Posting to X
Upload the final MP4 and describe the outcome in 1–2 lines:
- what changed
- why it matters (onboarding friction ↓, concurrency ↑, more agents online, etc.)

---

## Short “X thread” version you can paste
1) We now generate Eliza Town demos as deterministic Playwright runs (no manual recording).
2) Local stack: Convex local backend + `convex dev` + Vite.
3) Playwright drives the full flow and records a clean WebM.
4) ffmpeg converts it to an X-ready MP4.
5) Result: repeatable daily demos + less time spent re-recording UI changes.
