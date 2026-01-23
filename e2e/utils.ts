import { expect, type Page } from '@playwright/test';

const spritePath = 'public/assets/characters/char-f1.png';

export const gotoHome = async (page: Page) => {
  await page.goto('/ai-town/');
};

export const enterWorld = async (page: Page) => {
  await page.getByTestId('enter-world').click();
  await expect(page.getByTestId('game-view')).toBeVisible();
};

export const openJoinDialog = async (page: Page) => {
  await page.getByTestId('join-world').click();
  await expect(page.getByTestId('join-world-dialog')).toBeVisible();
};

export const openCharacters = async (page: Page) => {
  await page.getByTestId('open-characters').click();
  await expect(page.getByTestId('create-character-dialog')).toBeVisible();
};

export const openAgentList = async (page: Page) => {
  await page.getByTestId('open-agent-list').click();
  await expect(page.getByTestId('agent-list-dialog')).toBeVisible();
};

export const openCreateAgent = async (page: Page) => {
  await page.getByTestId('open-create-agent').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeVisible();
};

export const createCustomCharacter = async (page: Page, name: string) => {
  await openCharacters(page);
  await page.getByTestId('character-sprite-upload').setInputFiles(spritePath);
  await page.getByTestId('character-upload-sprite').click();
  await expect(page.getByTestId('character-name')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('character-name').fill(name);
  await page.getByTestId('character-save').click();
  await expect(page.getByTestId('create-character-dialog')).toBeHidden();
};

export const ensureCustomCharacter = async (page: Page) => {
  await openCharacters(page);
  const existing = page.locator('[data-testid^="character-item-"]');
  if (await existing.count()) {
    await page.getByTestId('create-character-close').click();
    await expect(page.getByTestId('create-character-dialog')).toBeHidden();
    return;
  }
  const name = `E2E Sprite ${Date.now()}`;
  await page.getByTestId('character-sprite-upload').setInputFiles(spritePath);
  await page.getByTestId('character-upload-sprite').click();
  await expect(page.getByTestId('character-name')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('character-name').fill(name);
  await page.getByTestId('character-save').click();
  await expect(page.getByTestId('create-character-dialog')).toBeHidden();
};

export const createCustomAgent = async (page: Page, name: string) => {
  await ensureCustomCharacter(page);
  await openCreateAgent(page);
  await page.getByTestId('agent-name').fill(name);
  await page.getByTestId('agent-identity').fill('A quick thinker.');
  await page.getByTestId('agent-plan').fill('Meet every neighbor.');
  await page.getByTestId('agent-personality-friendly').click();
  await page.getByTestId('agent-personality-curious').click();
  await page.getByTestId('agent-create').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden({ timeout: 60000 });
};

export const ensureCustomAgent = async (page: Page) => {
  await openAgentList(page);
  const agents = page.locator('[data-testid^="agent-row-"]');
  if (await agents.count()) {
    await page.getByTestId('agent-list-done').click();
    await expect(page.getByTestId('agent-list-dialog')).toBeHidden();
    return;
  }
  await page.getByTestId('agent-list-done').click();
  await expect(page.getByTestId('agent-list-dialog')).toBeHidden();
  await createCustomAgent(page, `E2E Agent ${Date.now()}`);
};

export const takeOverFirstAgent = async (page: Page) => {
  await openJoinDialog(page);
  const agentButton = page.locator('[data-testid^="join-world-agent-"]').first();
  await agentButton.click();
  await page.getByTestId('join-world-takeover').click();
  await expect(page.getByTestId('join-world-dialog')).toBeHidden();
  await expect(page.getByTestId('join-world')).toHaveText(/Release/);
  await expect(page.getByTestId('test-human-player-id')).not.toHaveText('not-playing', {
    timeout: 20000,
  });
};

export const takeOverAgentByName = async (page: Page, name: string) => {
  await openJoinDialog(page);
  const agentButton = page
    .locator('[data-testid^="join-world-agent-"]')
    .filter({ hasText: name })
    .first();
  await agentButton.click();
  await page.getByTestId('join-world-takeover').click();
  await expect(page.getByTestId('join-world-dialog')).toBeHidden();
  await expect(page.getByTestId('join-world')).toHaveText(/Release/);
  await expect(page.getByTestId('test-human-player-id')).not.toHaveText('not-playing', {
    timeout: 20000,
  });
};

export const releaseAgent = async (page: Page) => {
  await page.getByTestId('join-world').click();
  await expect(page.getByTestId('join-world')).toHaveText(/Take Over/);
};

export const selectNonHumanPlayer = async (page: Page) => {
  const humanLabel = page.getByTestId('test-human-player-id');
  await expect(humanLabel).not.toHaveText('not-playing', { timeout: 20000 });
  const humanId = (await humanLabel.textContent())?.trim();
  const buttons = page.locator('[data-testid^="test-player-select-"]');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    const playerId = await button.getAttribute('data-player-id');
    if (playerId && playerId !== humanId) {
      await button.click();
      return playerId;
    }
  }
  throw new Error('No non-human player found in test controls.');
};
