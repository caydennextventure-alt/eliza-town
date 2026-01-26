# E2E Findings

## Fixes Applied
- Added an explicit close button to the Help modal so it can be dismissed without relying on overlay/ESC behavior.
- Guarded the music toggle so it does not throw when audio is unavailable or not yet loaded.
- Added `data-testid` hooks across interactive UI controls for stable Playwright selectors.
- Added `data-testid` hooks to the Werewolf panel/spectator views for queue, match, roster, transcript, and dialog assertions.

## Test Environment Notes
- E2E runs against a real local Convex backend and ElizaOS server; no mock backend is used.
- A test-only control overlay exposes player selection, invite triggers, and position readouts for stable assertions.
- Manual sprite upload is available for tests to avoid external image-generation dependencies.

## Risks / Follow-ups
- Canvas-level interactions (Pixi object picking) are exercised indirectly via the test-only player list.
  If full canvas click behavior needs coverage, add a dedicated visual interaction test.
