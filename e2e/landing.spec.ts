import { expect, test } from '@playwright/test';
import { enterWorld, gotoScenario } from './utils';

test('landing page interactions', async ({ page }) => {
  await gotoScenario(page, 'base');

  await expect(page.getByText('ELIZA TOWN')).toBeVisible();

  await page.getByTestId('help-button').click();
  await expect(page.getByTestId('help-modal')).toBeVisible();
  await page.getByTestId('help-close').click();
  await expect(page.getByTestId('help-modal')).toBeHidden();

  await expect(page.getByTestId('star-link')).toHaveAttribute(
    'href',
    'https://github.com/cayden970207/eliza-town',
  );

  const musicToggle = page.getByTestId('music-toggle');
  await expect(musicToggle).toHaveText('Music');
  await musicToggle.click();
  await expect(musicToggle).toHaveText('Mute');
  await page.keyboard.press('m');
  await expect(musicToggle).toHaveText('Music');

  await enterWorld(page);
  await page.getByTestId('exit-world').click();
  await expect(page.getByTestId('enter-world')).toBeVisible();
});
