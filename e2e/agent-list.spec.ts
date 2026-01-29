import { expect, test } from '@playwright/test';
import {
  enterWorld,
  gotoHome,
  ensureNamedAgentsViaConvex,
  resolveElizaAgentIdFromEnv,
  takeOverAgentByName,
  openAgentList,
  releaseAgent,
} from './utils';

const hasElizaServer = !!process.env.E2E_ELIZA_SERVER_URL;

test.skip(!hasElizaServer, 'E2E_ELIZA_SERVER_URL is required for agent list tests.');

test('remove controlled agent with confirmation', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);

  const agentName = process.env.E2E_ELIZA_REMOVE_AGENT_NAME ?? 'E2E Werewolf 1';
  const agentId =
    process.env.E2E_ELIZA_REMOVE_AGENT_ID ??
    resolveElizaAgentIdFromEnv(agentName);
  const elizaServerUrl = process.env.E2E_ELIZA_SERVER_URL;
  if (!elizaServerUrl) {
    throw new Error('Missing Eliza server URL. Set E2E_ELIZA_SERVER_URL.');
  }
  if (!agentId) {
    throw new Error(`Missing Eliza agent id for "${agentName}".`);
  }
  await ensureNamedAgentsViaConvex(page, [agentName], {
    elizaAgentIdsByName: { [agentName]: agentId },
    elizaServerUrl,
    elizaAuthToken: process.env.E2E_ELIZA_AUTH_TOKEN,
  });
  await takeOverAgentByName(page, agentName);

  await openAgentList(page);
  await page.getByTestId('agent-list-close').click();
  await expect(page.getByTestId('agent-list-dialog')).toBeHidden();

  await openAgentList(page);
  const row = page
    .locator('[data-testid^="agent-row-"]')
    .filter({ hasText: agentName })
    .filter({ hasText: 'You are controlling this agent.' })
    .first();
  await expect(row).toBeVisible({ timeout: 20000 });
  const initialCount = await page.locator(`[data-agent-name="${agentName}"]`).count();
  const removeButton = row.locator('[data-testid^="agent-remove-"]');
  await expect(removeButton).toBeEnabled({ timeout: 20000 });
  await removeButton.click();

  const cancelButton = row.locator('[data-testid^="agent-cancel-remove-"]');
  await cancelButton.click();

  await removeButton.click();
  const confirmButton = row.locator('[data-testid^="agent-confirm-remove-"]');
  await confirmButton.click();

  await expect
    .poll(async () => page.locator(`[data-agent-name="${agentName}"]`).count(), {
      timeout: 30000,
    })
    .toBeLessThan(initialCount);
  await page.getByTestId('agent-list-done').click();
  const joinText = (await page.getByTestId('join-world').textContent()) ?? '';
  if (joinText.includes('Release')) {
    await releaseAgent(page);
  }
});
