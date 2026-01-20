import { expect, test } from '@playwright/test';
import { enterWorld, gotoScenario, openJoinDialog } from './utils';

test('start a conversation invite from the map selection', async ({ page }) => {
  await gotoScenario(page, 'base');
  await enterWorld(page);

  await openJoinDialog(page);
  await page.getByTestId('join-world-takeover').click();
  await expect(page.getByTestId('join-world-dialog')).toBeHidden();

  await page.getByTestId('player-select-p:2').click();
  await page.getByTestId('close-player-details').click();
  await expect(page.getByTestId('player-details-empty')).toBeVisible();

  await page.getByTestId('player-select-p:2').click();
  await page.getByTestId('start-conversation').click();
  await expect(page.getByText('Waiting for accept...')).toBeVisible();
});

test('accept invite, send a message, and leave conversation', async ({ page }) => {
  await gotoScenario(page, 'invited');
  await enterWorld(page);

  await page.getByTestId('accept-invite').click();
  await expect(page.getByTestId('message-input')).toBeVisible();

  await page.getByTestId('message-input').fill('Hello!');
  await page.getByTestId('message-input').press('Enter');
  await expect(page.getByText('Hello!')).toBeVisible();

  await page.getByTestId('leave-conversation').click();
  await expect(page.getByTestId('player-details-empty')).toBeVisible();
});

test('reject invite from player details', async ({ page }) => {
  await gotoScenario(page, 'invited');
  await enterWorld(page);

  await page.getByTestId('reject-invite').click();
  await expect(page.getByTestId('player-details-empty')).toBeVisible();
});
