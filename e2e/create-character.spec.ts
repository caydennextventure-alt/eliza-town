import { expect, test } from '@playwright/test';
import { enterWorld, gotoHome, openCharacters } from './utils';

test('create, regenerate, and delete a character', async ({ page }) => {
  await gotoHome(page);
  await enterWorld(page);

  await openCharacters(page);

  await page.getByTestId('character-generate-concept').click();
  await expect(page.getByTestId('character-error')).toBeVisible();

  await page.getByTestId('character-sprite-upload').setInputFiles(
    'public/assets/characters/char-f1.png',
  );
  await page.getByTestId('character-upload-sprite').click();

  await expect(page.getByTestId('character-name')).toBeVisible({ timeout: 20000 });
  const characterName = `E2E Sprite ${Date.now()}`;
  await page.getByTestId('character-name').fill(characterName);
  await page.getByTestId('character-save').click();

  await expect(page.getByTestId('create-character-dialog')).toBeHidden();

  await openCharacters(page);
  const characterItem = page
    .locator('[data-testid^="character-item-"]')
    .filter({ hasText: characterName })
    .first();
  await expect(characterItem).toBeVisible();
  await characterItem.locator('[data-testid^="character-delete-"]').click();
  await expect(
    page.locator('[data-testid^="character-item-"]').filter({ hasText: characterName }),
  ).toHaveCount(0);
  await page.getByTestId('create-character-close').click();
  await expect(page.getByTestId('create-character-dialog')).toBeHidden();
});
