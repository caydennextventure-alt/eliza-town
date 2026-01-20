import { expect, test } from '@playwright/test';
import { enterWorld, gotoScenario } from './utils';

test('create agent with custom characters and traits', async ({ page }) => {
  await gotoScenario(page, 'with-character');
  await enterWorld(page);

  await page.getByTestId('open-create-agent').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
  await page.getByTestId('create-agent-close').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();

  await page.getByTestId('open-create-agent').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeVisible();

  await page.getByTestId('agent-create').click();
  await expect(page.getByTestId('agent-error')).toBeVisible();

  await page.getByTestId('agent-name').fill('Rin');
  await page.getByTestId('agent-identity').fill('A quick thinker.');
  await page.getByTestId('agent-plan').fill('Meet every neighbor.');
  await page.getByTestId('agent-personality-friendly').click();
  await page.getByTestId('agent-personality-curious').click();
  await page.getByTestId('agent-character-next').click();
  await page.getByTestId('agent-character-prev').click();

  await page.getByTestId('agent-create').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();

  await page.getByTestId('open-agent-list').click();
  await expect(page.getByText('Rin')).toBeVisible();
  await page.getByTestId('agent-list-done').click();

  await page.getByTestId('open-create-agent').click();
  await page.getByTestId('agent-cancel').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();
});
