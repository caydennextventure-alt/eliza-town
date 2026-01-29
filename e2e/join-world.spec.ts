import { expect, test } from '@playwright/test';
import {
  enterWorld,
  gotoHome,
  openJoinDialog,
  ensureCustomAgent,
  takeOverFirstAgent,
  releaseAgent,
  listCustomAgentEntries,
  removeAgentsById,
} from './utils';

const hasElizaServer = !!process.env.E2E_ELIZA_SERVER_URL;

test.skip(!hasElizaServer, 'E2E_ELIZA_SERVER_URL is required for join-world tests.');

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

  const agentEntries = await listCustomAgentEntries(page);
  if (agentEntries.length > 0) {
    await removeAgentsById(page, agentEntries.map((entry) => entry.agentId));
  }

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
