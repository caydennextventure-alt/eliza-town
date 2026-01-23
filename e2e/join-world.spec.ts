import { expect, test } from '@playwright/test';
import { enterWorld, gotoHome, openJoinDialog, ensureCustomAgent, takeOverFirstAgent, releaseAgent, openAgentList } from './utils';

test('take over and release an agent', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);
  await ensureCustomAgent(page);

  await openJoinDialog(page);
  await page.getByTestId('join-world-close').click();
  await expect(page.getByTestId('join-world-dialog')).toBeHidden();

  await takeOverFirstAgent(page);
  await releaseAgent(page);
});

test('join dialog empty state can route to create agent', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);

  const joinButton = page.getByTestId('join-world');
  const joinText = (await joinButton.textContent()) ?? '';
  if (joinText.includes('Release')) {
    await joinButton.click();
    await expect(joinButton).toHaveText(/Take Over/);
  }

  await openAgentList(page);
  while (await page.locator('[data-testid^="agent-row-"]').count()) {
    const row = page.locator('[data-testid^="agent-row-"]').first();
    const agentName = await row.getAttribute('data-agent-name');
    await row.locator('[data-testid^="agent-remove-"]').click();
    await row.locator('[data-testid^="agent-confirm-remove-"]').click();
    if (agentName) {
      await expect(page.locator(`[data-agent-name="${agentName}"]`)).toHaveCount(0, {
        timeout: 30000,
      });
    }
  }
  await page.getByTestId('agent-list-done').click();
  await expect(page.getByTestId('agent-list-dialog')).toBeHidden();

  await openJoinDialog(page);
  await page.getByTestId('join-world-cancel').click();
  await expect(page.getByTestId('join-world-dialog')).toBeHidden();

  await openJoinDialog(page);
  await page.getByTestId('join-world-create-agent').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
  await page.getByTestId('agent-cancel').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();

  await openAgentList(page);
  await page.getByTestId('agent-list-create-agent').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
  await page.getByTestId('agent-cancel').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();
});
