import { expect, test } from '@playwright/test';
import {
  enterWorld,
  ensureNamedAgents,
  gotoHome,
  joinWerewolfQueueByName,
  openWerewolfPanel,
} from './utils';

const MATCH_START_TIMEOUT_MS = 180_000;
const MATCH_END_TIMEOUT_MS = 15 * 60_000;
const WEREWOLF_AGENT_NAMES = Array.from({ length: 8 }, (_, index) => `E2E Werewolf ${index + 1}`);

test.describe('werewolf full match', () => {
  test.setTimeout(MATCH_END_TIMEOUT_MS + 60_000);

  test('play a full werewolf game', async ({ page }) => {
    await gotoHome(page);
    await enterWorld(page);

    await ensureNamedAgents(page, WEREWOLF_AGENT_NAMES);

    await openWerewolfPanel(page);
    const { inMatchAgents } = await joinWerewolfQueueByName(page, WEREWOLF_AGENT_NAMES);
    if (inMatchAgents.length > 0) {
      test.info().annotations.push({
        type: 'note',
        description: `Using existing match for agents: ${inMatchAgents.join(', ')}`,
      });
    }

    await page.getByTestId('werewolf-tab-matches').click();
    const matchCard = page.locator('[data-testid^="werewolf-match-"]').first();
    await expect(matchCard).toBeVisible({ timeout: MATCH_START_TIMEOUT_MS });
    await matchCard.locator('[data-testid^="werewolf-watch-"]').click();

    const panel = page.getByTestId('werewolf-panel');
    if (await panel.isVisible()) {
      await page.getByTestId('werewolf-panel-close').click();
      await expect(panel).toBeHidden();
    }

    await expect(page.getByTestId('werewolf-spectator-panel')).toBeVisible();
    await expect(page.getByTestId('werewolf-spectator-phase')).toBeVisible({
      timeout: MATCH_START_TIMEOUT_MS,
    });

    await expect
      .poll(
        async () =>
          page.locator('[data-testid="werewolf-transcript-entry"]').count(),
        { timeout: MATCH_START_TIMEOUT_MS },
      )
      .toBeGreaterThan(0);

    await expect(page.getByTestId('werewolf-roster')).toBeVisible();
    await expect(page.getByTestId('werewolf-player-dialogs')).toBeVisible();

    await expect(page.getByTestId('werewolf-spectator-phase')).toHaveText('ENDED', {
      timeout: MATCH_END_TIMEOUT_MS,
    });
  });
});
