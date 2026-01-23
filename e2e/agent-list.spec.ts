import { expect, test } from '@playwright/test';
import { enterWorld, gotoHome, createCustomAgent, takeOverAgentByName, openAgentList, releaseAgent } from './utils';

test('remove controlled agent with confirmation', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);

  const agentName = `E2E Remove ${Date.now()}`;
  await createCustomAgent(page, agentName);
  await takeOverAgentByName(page, agentName);

  await openAgentList(page);
  await page.getByTestId('agent-list-close').click();
  await expect(page.getByTestId('agent-list-dialog')).toBeHidden();

  await openAgentList(page);
  const row = page.locator('[data-testid^="agent-row-"]').filter({ hasText: agentName }).first();
  const removeButton = row.locator('[data-testid^="agent-remove-"]');
  await removeButton.click();

  const cancelButton = row.locator('[data-testid^="agent-cancel-remove-"]');
  await cancelButton.click();

  await removeButton.click();
  const confirmButton = row.locator('[data-testid^="agent-confirm-remove-"]');
  await confirmButton.click();

  await expect(page.locator(`[data-agent-name="${agentName}"]`)).toHaveCount(0, {
    timeout: 30000,
  });
  await page.getByTestId('agent-list-done').click();
  const joinText = (await page.getByTestId('join-world').textContent()) ?? '';
  if (joinText.includes('Release')) {
    await releaseAgent(page);
  }
});
