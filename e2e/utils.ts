import { expect, type Page } from '@playwright/test';

export const gotoScenario = async (page: Page, scenario: string) => {
  await page.goto(`/ai-town/?mock=${scenario}`);
};

export const enterWorld = async (page: Page) => {
  await page.getByTestId('enter-world').click();
  await expect(page.getByTestId('game-view')).toBeVisible();
};

export const openJoinDialog = async (page: Page) => {
  await page.getByTestId('join-world').click();
  await expect(page.getByTestId('join-world-dialog')).toBeVisible();
};
