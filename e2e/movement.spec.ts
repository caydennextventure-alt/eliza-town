import { expect, test } from '@playwright/test';
import {
  enterWorld,
  gotoHome,
  ensureCustomAgent,
  takeOverFirstAgent,
  ensureNoActiveConversation,
} from './utils';

const hasElizaServer = !!process.env.E2E_ELIZA_SERVER_URL;

test.skip(!hasElizaServer, 'E2E_ELIZA_SERVER_URL is required for movement tests.');

test('move action updates the player position', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);
  await ensureCustomAgent(page);
  await takeOverFirstAgent(page);
  await ensureNoActiveConversation(page);

  const positionLabel = page.getByTestId('test-player-position');
  const initialPosition = (await positionLabel.textContent())?.trim() ?? '';

  const waitForPositionChange = async (previous: string, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const current = (await positionLabel.textContent())?.trim() ?? '';
      if (current && current !== previous) {
        return current;
      }
      await page.waitForTimeout(1000);
    }
    return null;
  };

  const attemptMove = async (previous: string) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.getByTestId('test-move').click();
      const next = await waitForPositionChange(previous, 20000);
      if (next && next !== previous) {
        return next;
      }
    }
    return null;
  };

  const afterFirstMove = await attemptMove(initialPosition);
  if (!afterFirstMove) {
    throw new Error('Player position did not change after move input.');
  }

  const afterSecondMove = await attemptMove(afterFirstMove);
  if (!afterSecondMove) {
    throw new Error('Player position did not change after second move input.');
  }
});
