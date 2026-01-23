import { expect, test } from '@playwright/test';
import {
  enterWorld,
  gotoHome,
  ensureCustomAgent,
  takeOverFirstAgent,
  selectNonHumanPlayer,
} from './utils';

test('start a conversation invite from the map selection', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);
  await ensureCustomAgent(page);
  await takeOverFirstAgent(page);

  await selectNonHumanPlayer(page);
  await page.getByTestId('close-player-details').click();
  await expect(page.getByTestId('player-details-empty')).toBeVisible();

  await selectNonHumanPlayer(page);
  await page.getByTestId('start-conversation').click();
  await expect(page.getByText('Waiting for accept...')).toBeVisible();
});

test('accept invite, send a message, and leave conversation', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);
  await ensureCustomAgent(page);
  await takeOverFirstAgent(page);

  await selectNonHumanPlayer(page);
  await page.getByTestId('test-invite-me').click();
  await expect(page.getByTestId('accept-invite')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('accept-invite').click();
  await expect(page.getByTestId('message-input')).toBeVisible();

  await page.getByTestId('message-input').fill('Hello!');
  await page.getByTestId('message-input').press('Enter');
  await expect(page.getByText('Hello!')).toBeVisible();

  await page.getByTestId('leave-conversation').click();
  await expect(page.getByTestId('player-details-empty')).toBeVisible();
});

test('reject invite from player details', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);
  await ensureCustomAgent(page);
  await takeOverFirstAgent(page);

  await selectNonHumanPlayer(page);
  await page.getByTestId('test-invite-me').click();
  await expect(page.getByTestId('reject-invite')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('reject-invite').click();
  await expect(page.getByTestId('player-details-empty')).toBeVisible();
});
