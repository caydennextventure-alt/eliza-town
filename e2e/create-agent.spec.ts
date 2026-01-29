import { expect, test } from '@playwright/test';
import {
  enterWorld,
  gotoHome,
  ensureCustomCharacter,
  openAgentList,
  loadElizaAgentsWithRetry,
} from './utils';

const hasElizaServer = !!process.env.E2E_ELIZA_SERVER_URL;

test.skip(!hasElizaServer, 'E2E_ELIZA_SERVER_URL is required for agent creation tests.');

test('create agent with custom characters and traits', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);
  await ensureCustomCharacter(page);

  await page.getByTestId('open-create-agent').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
  await page.getByTestId('create-agent-close').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();

  await page.getByTestId('open-create-agent').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeVisible();

  await page.getByTestId('agent-create').click();
  await expect(page.getByTestId('agent-error')).toBeVisible();

  const elizaUrl = process.env.E2E_ELIZA_SERVER_URL;
  const elizaAgentName =
    process.env.E2E_ELIZA_CREATE_AGENT_NAME ?? 'E2E Werewolf 1';
  const elizaToken = process.env.E2E_ELIZA_AUTH_TOKEN;
  if (!elizaUrl) {
    throw new Error('Missing Eliza server URL. Set E2E_ELIZA_SERVER_URL.');
  }
  await page.getByTestId('agent-eliza-url').fill(elizaUrl);
  if (elizaToken) {
    await page.getByTestId('agent-eliza-api-key').fill(elizaToken);
  }
  await loadElizaAgentsWithRetry(page);
  const select = page.getByTestId('agent-eliza-select');
  const optionValue = await select.evaluate((node, desiredName) => {
    const selectNode = node as HTMLSelectElement;
    const target = desiredName.toLowerCase();
    const option = Array.from(selectNode.options).find((opt) =>
      opt.textContent?.toLowerCase().includes(target),
    );
    return option?.value ?? '';
  }, elizaAgentName);
  if (!optionValue) {
    throw new Error(`Unable to find agent option matching "${elizaAgentName}".`);
  }
  await select.selectOption(optionValue);

  await page.getByTestId('agent-create').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden({ timeout: 60000 });

  await openAgentList(page);
  const listDialog = page.getByTestId('agent-list-dialog');
  await expect
    .poll(async () => listDialog.locator(`[data-agent-name="${elizaAgentName}"]`).count(), {
      timeout: 20000,
    })
    .toBeGreaterThan(0);
  await page.getByTestId('agent-list-done').click();

  await page.getByTestId('open-create-agent').click();
  await page.getByTestId('agent-cancel').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();
});
