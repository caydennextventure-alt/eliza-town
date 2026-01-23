import { expect, test } from '@playwright/test';
import { enterWorld, gotoHome, ensureCustomAgent, takeOverFirstAgent } from './utils';

test('move action updates the player position', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);
  await ensureCustomAgent(page);
  await takeOverFirstAgent(page);

  await page.getByTestId('test-move').click();
  await expect(page.getByTestId('test-player-position')).toHaveText('1,1', {
    timeout: 20000,
  });

  await page.getByTestId('test-move').click();
  await expect(page.getByTestId('test-player-position')).toHaveText('2,2', {
    timeout: 20000,
  });
});
