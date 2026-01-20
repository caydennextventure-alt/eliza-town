import { expect, test } from '@playwright/test';
import { enterWorld, gotoScenario, openJoinDialog } from './utils';

test('take over and release an agent', async ({ page }) => {
  await gotoScenario(page, 'base');
  await enterWorld(page);

  await openJoinDialog(page);
  await page.getByTestId('join-world-close').click();
  await expect(page.getByTestId('join-world-dialog')).toBeHidden();

  await openJoinDialog(page);
  await page.locator('[data-testid^="join-world-agent-"]').first().click();
  await page.getByTestId('join-world-takeover').click();
  await expect(page.getByTestId('join-world-dialog')).toBeHidden();
  await expect(page.getByTestId('join-world')).toHaveText(/Release/);

  await page.getByTestId('join-world').click();
  await expect(page.getByTestId('join-world')).toHaveText(/Take Over/);
});

test('join dialog empty state can route to create agent', async ({ page }) => {
  await gotoScenario(page, 'no-agents');
  await enterWorld(page);

  await openJoinDialog(page);
  await page.getByTestId('join-world-cancel').click();
  await expect(page.getByTestId('join-world-dialog')).toBeHidden();

  await openJoinDialog(page);
  await page.getByTestId('join-world-create-agent').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
  await page.getByTestId('agent-cancel').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();

  await page.getByTestId('open-agent-list').click();
  await page.getByTestId('agent-list-create-agent').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
  await page.getByTestId('agent-cancel').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();
});
