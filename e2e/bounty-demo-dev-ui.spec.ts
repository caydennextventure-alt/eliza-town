import { expect, test } from '@playwright/test';

test('bounty demo (dev UI) - takeover + close panel', async ({ page }) => {
  await page.goto('/ai-town/');

  // Enter world
  const enter = page.getByTestId('enter-world');
  await expect(enter).toBeVisible({ timeout: 60_000 });
  await enter.click();
  await expect(page.getByTestId('game-view')).toBeVisible({ timeout: 60_000 });

  // Open takeover dialog
  const joinButton = page.getByTestId('join-world');
  await expect(joinButton).toBeVisible({ timeout: 60_000 });
  await joinButton.click();
  const joinDialog = page.getByTestId('join-world-dialog');
  await expect(joinDialog).toBeVisible({ timeout: 60_000 });

  // Take over first available agent
  const agentButtons = page.locator('[data-testid^="join-world-agent-"]');
  await expect(agentButtons.first()).toBeVisible({ timeout: 60_000 });
  await agentButtons.first().click();
  await page.getByTestId('join-world-takeover').click();

  // Wait until takeover state flips (button says Release)
  await expect(joinButton).toHaveText(/Release/i, { timeout: 60_000 });

  // Close takeover dialog if still open
  if (await joinDialog.isVisible().catch(() => false)) {
    await page.getByTestId('join-world-cancel').click();
    await expect(joinDialog).toBeHidden({ timeout: 20_000 });
  }

  // Open agent list panel/dialog, then close it (closepanel style).
  await page.getByTestId('open-agent-list').click();
  const listDialog = page.getByTestId('agent-list-dialog');
  await expect(listDialog).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);

  const done = page.getByTestId('agent-list-done');
  if (await done.isVisible().catch(() => false)) {
    await done.click();
  } else {
    await page.getByTestId('agent-list-close').click();
  }
  await expect(listDialog).toBeHidden({ timeout: 20_000 });

  await page.waitForTimeout(750);
});
