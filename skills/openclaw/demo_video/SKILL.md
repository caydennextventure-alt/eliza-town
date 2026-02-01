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

## 3) Run the local backend + frontend (dev)

In `eliza-town-three`, the easiest way is to use the built-in E2E dev scripts.

### 3.1 Start the backend (Convex local in “anonymous” mode)
From the repo root:
```bash
npm run dev:backend:e2e
```

### 3.2 Start the frontend (force port 5173)
From the repo root:
```bash
E2E_VITE_PORT=5173 npm run dev:frontend:e2e
```

You should have the game available at:
- `http://localhost:5173/ai-town`

---

## 4) The demo test (Playwright)

### 4.1 The spec file
We used a purpose-built spec:
- `e2e/bounty-demo-dev-ui.spec.ts`

Flow:
- enter the world
- create a custom character
- create/connect an agent
- take over the agent
- open the Agents panel
- close the panel (the “closepanel” ending)

### 4.2 Run just that test
From the repo root:
```bash
npx playwright test e2e/bounty-demo-dev-ui.spec.ts \
  --config playwright.bounty.config.ts \
  --reporter=line
```

On success, Playwright writes the recording to:
- `test-results/e2e-bounty-demo-dev-ui-*/video.webm`

---

## 5) Convert WebM → MP4 (X-ready)
X accepts WebM in some cases, but MP4 is safest.

Convert with ffmpeg (example output path used in our verified run):
```bash
ffmpeg -y \
  -i test-results/e2e-bounty-demo-dev-ui-bou-c1cf1-v-UI---takeover-close-panel-chromium/video.webm \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 23 \
  -movflags +faststart \
  -an \
  /private/tmp/eliza-town-demo-closepanel.mp4
```

Result:
- `/private/tmp/eliza-town-demo-closepanel.mp4`

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
