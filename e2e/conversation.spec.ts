import { expect, test } from '@playwright/test';
import {
  enterWorld,
  gotoHome,
  ensureCustomAgents,
  ensureCustomCharacter,
  takeOverFirstAgent,
  selectInvitablePlayer,
  selectNonHumanPlayer,
  ensureNoActiveConversation,
} from './utils';

const hasElizaServer = !!process.env.E2E_ELIZA_SERVER_URL;

test.skip(!hasElizaServer, 'E2E_ELIZA_SERVER_URL is required for conversation tests.');

test('start a conversation invite from the map selection', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);
  await ensureCustomCharacter(page);
  await ensureCustomAgents(page, 2);
  await takeOverFirstAgent(page);
  await ensureNoActiveConversation(page);

  const playerId = await selectInvitablePlayer(page, { timeoutMs: 30000 });
  if (!playerId) {
    throw new Error('No available player found for conversation invite.');
  }
  await page.getByTestId(`test-player-select-${playerId}`).click();
  await expect(page.getByTestId('start-conversation')).toBeVisible();
  await page.getByTestId('close-player-details').click();
  await expect(page.getByTestId('player-details-empty')).toBeVisible();
});

test('accept invite, send a message, and leave conversation', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);
  await ensureCustomCharacter(page);
  await ensureCustomAgents(page, 2);
  await takeOverFirstAgent(page);
  await ensureNoActiveConversation(page);

  const playerId =
    (await selectInvitablePlayer(page, { timeoutMs: 30000 })) ??
    (await selectNonHumanPlayer(page));
  const acceptInvite = page.getByTestId('accept-invite');
  let inviteAccepted = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByTestId(`test-player-select-${playerId}`).click();
    await expect(page.getByTestId('test-invite-me')).toBeEnabled({ timeout: 20000 });
    await page.getByTestId('test-invite-me').click();
    try {
      await expect(acceptInvite).toBeVisible({ timeout: 5000 });
      await acceptInvite.scrollIntoViewIfNeeded();
      await acceptInvite.click({ force: true });
      inviteAccepted = true;
      break;
    } catch {
      // Retry invite if no visible accept button yet.
    }
    await page.waitForTimeout(2000);
  }
  if (!inviteAccepted) {
    throw new Error('No incoming invite received to accept.');
  }

  await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 60000 });

  await page.getByTestId('message-input').fill('Hello!');
  await page.getByTestId('message-input').press('Enter');
  await expect(page.getByText('Hello!')).toBeVisible();

  await page.getByTestId('leave-conversation').click();
  await page.getByTestId('close-player-details').click();
  await expect(page.getByTestId('player-details-empty')).toBeVisible();
});

test('reject invite from player details', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);
  await ensureCustomCharacter(page);
  await ensureCustomAgents(page, 2);
  await takeOverFirstAgent(page);
  await ensureNoActiveConversation(page);

  const playerId =
    (await selectInvitablePlayer(page, { timeoutMs: 30000 })) ??
    (await selectNonHumanPlayer(page));
  await page.getByTestId(`test-player-select-${playerId}`).click();
  await expect(page.getByTestId('test-invite-me')).toBeEnabled({ timeout: 20000 });
  await page.getByTestId('test-invite-me').click();
  await expect(page.getByTestId('reject-invite')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('reject-invite').click({ force: true });
  await page.getByTestId('close-player-details').click();
  await expect(page.getByTestId('player-details-empty')).toBeVisible();
});
