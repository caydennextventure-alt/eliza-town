import { expect, test } from '@playwright/test';
import { enterWorld, gotoHome, ensureCustomCharacter, openAgentList } from './utils';

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

  const agentName = `E2E Agent ${Date.now()}`;
  await page.getByTestId('agent-name').fill(agentName);
  await page.getByTestId('agent-identity').fill('A quick thinker.');
  await page.getByTestId('agent-plan').fill('Meet every neighbor.');
  await page.getByTestId('agent-personality-friendly').click();
  await page.getByTestId('agent-personality-curious').click();

  await page.getByTestId('agent-create').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden({ timeout: 60000 });

  await openAgentList(page);
  await expect(page.getByText(agentName)).toBeVisible();
  await page.getByTestId('agent-list-done').click();

  await page.getByTestId('open-create-agent').click();
  await page.getByTestId('agent-cancel').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();
});
