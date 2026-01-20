import { expect, test } from '@playwright/test';
import { enterWorld, gotoScenario } from './utils';

test('remove controlled agent with confirmation', async ({ page }) => {
  await gotoScenario(page, 'controlled');
  await enterWorld(page);

  await page.getByTestId('open-agent-list').click();
  await expect(page.getByTestId('agent-list-dialog')).toBeVisible();
  await page.getByTestId('agent-list-close').click();
  await expect(page.getByTestId('agent-list-dialog')).toBeHidden();

  await page.getByTestId('open-agent-list').click();
  await expect(page.getByTestId('agent-list-dialog')).toBeVisible();

  const removeButton = page.locator('[data-testid^="agent-remove-"]').first();
  await removeButton.click();

  const cancelButton = page.locator('[data-testid^="agent-cancel-remove-"]').first();
  await cancelButton.click();

  await removeButton.click();
  const confirmButton = page.locator('[data-testid^="agent-confirm-remove-"]').first();
  await confirmButton.click();

  await expect(page.locator('[data-testid^="agent-remove-"]')).toHaveCount(0);
  await page.getByTestId('agent-list-done').click();
});
