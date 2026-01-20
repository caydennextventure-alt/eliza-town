# E2E Findings

## Fixes Applied
- Added an explicit close button to the Help modal so it can be dismissed without relying on overlay/ESC behavior.
- Guarded the music toggle so it does not throw when audio is unavailable or not yet loaded.
- Added `data-testid` hooks across interactive UI controls for stable Playwright selectors.

## Test Environment Notes
- E2E runs in a mock Convex mode to keep tests deterministic and avoid external dependencies.
- A lightweight mock map is used for rendering; movement is validated through a test-only control overlay.

## Risks / Follow-ups
- Canvas-level interactions (Pixi object picking) are exercised indirectly via the test-only player list.
  If full canvas click behavior needs coverage, add a dedicated visual interaction test.
