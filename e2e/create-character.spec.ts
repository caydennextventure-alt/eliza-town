import { expect, test } from '@playwright/test';
import { enterWorld, gotoScenario } from './utils';

test('create, regenerate, and delete a character', async ({ page }) => {
  await gotoScenario(page, 'no-custom');
  await enterWorld(page);

  await page.getByTestId('open-characters').click();
  await expect(page.getByTestId('create-character-dialog')).toBeVisible();

  await page.getByTestId('character-generate-concept').click();
  await expect(page.getByTestId('character-error')).toBeVisible();

  await page.getByTestId('character-prompt').fill('A curious explorer.');
  await page
    .getByTestId('character-reference-upload')
    .setInputFiles('public/assets/eliza.jpg');
  await page.getByTestId('character-generate-concept').click();

  await expect(page.getByTestId('character-generate-sprite')).toBeVisible();
  await page.getByTestId('character-back').click();
  await expect(page.getByTestId('character-prompt')).toHaveValue('A curious explorer.');

  await page.getByTestId('character-generate-concept').click();
  await page.getByTestId('character-generate-sprite').click();

  await expect(page.getByTestId('character-name')).toBeVisible();
  await page.getByTestId('character-regenerate').click();
  await page.getByTestId('character-edit-back').click();
  await page.getByTestId('character-generate-sprite').click();
  await page.getByTestId('character-name').fill('Explorer');
  await page.getByTestId('character-save').click();

  await expect(page.getByTestId('create-character-dialog')).toBeHidden();

  await page.getByTestId('open-characters').click();
  const characterItem = page.locator('[data-testid^="character-item-"]').first();
  await expect(characterItem).toBeVisible();
  await characterItem.locator('[data-testid^="character-delete-"]').click();
  await expect(page.locator('[data-testid^="character-item-"]')).toHaveCount(0);
  await page.getByTestId('create-character-close').click();
  await expect(page.getByTestId('create-character-dialog')).toBeHidden();
});
