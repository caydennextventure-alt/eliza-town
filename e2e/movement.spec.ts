import { expect, test } from '@playwright/test';
import { enterWorld, gotoScenario, openJoinDialog } from './utils';

test('move action updates the player position', async ({ page }) => {
  await gotoScenario(page, 'base');
  await enterWorld(page);

  await openJoinDialog(page);
  await page.getByTestId('join-world-takeover').click();
  await expect(page.getByTestId('join-world-dialog')).toBeHidden();

  await page.getByTestId('mock-move').click();
  await expect(page.getByTestId('player-position')).toHaveText('1,1');

  await page.getByTestId('mock-move').click();
  await expect(page.getByTestId('player-position')).toHaveText('2,2');
});
