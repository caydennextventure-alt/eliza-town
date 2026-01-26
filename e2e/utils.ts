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

const closeAgentList = async (page: Page) => {
  const closeButton = page.getByTestId('agent-list-close');
  await closeButton.scrollIntoViewIfNeeded();
  await closeButton.click();
  await expect(page.getByTestId('agent-list-dialog')).toBeHidden();
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
  await createCustomAgentWithOptions(page, name);
};

export const ensureCustomAgent = async (page: Page) => {
  await openAgentList(page);
  const agents = page.locator('[data-testid^="agent-row-"]');
  if (await agents.count()) {
    await closeAgentList(page);
    return;
  }
  await closeAgentList(page);
  await createCustomAgent(page, `E2E Agent ${Date.now()}`);
};

type CreateAgentOptions = {
  ensureCharacter?: boolean;
  elizaServerUrl?: string;
  elizaAuthToken?: string;
  identity?: string;
  plan?: string;
  personalityTraits?: string[];
};

export const createCustomAgentWithOptions = async (
  page: Page,
  name: string,
  options: CreateAgentOptions = {},
) => {
  const {
    ensureCharacter = true,
    elizaServerUrl,
    elizaAuthToken,
    identity = 'A quick thinker.',
    plan = 'Meet every neighbor.',
    personalityTraits = ['Friendly', 'Curious'],
  } = options;
  if (ensureCharacter) {
    await ensureCustomCharacter(page);
  }
  await openCreateAgent(page);
  await page.getByTestId('agent-name').fill(name);
  await page.getByTestId('agent-identity').fill(identity);
  await page.getByTestId('agent-plan').fill(plan);
  for (const trait of personalityTraits) {
    const testId = `agent-personality-${trait.toLowerCase()}`;
    await page.getByTestId(testId).click();
  }
  const elizaUrl = elizaServerUrl ?? process.env.E2E_ELIZA_SERVER_URL;
  const elizaToken = elizaAuthToken ?? process.env.E2E_ELIZA_AUTH_TOKEN;
  if (elizaUrl) {
    await page.getByTestId('agent-eliza-url').fill(elizaUrl);
  }
  if (elizaToken) {
    await page.getByTestId('agent-eliza-api-key').fill(elizaToken);
  }
  await page.getByTestId('agent-create').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden({ timeout: 60000 });
};

export const getCustomAgentCount = async (page: Page) => {
  await openAgentList(page);
  const agents = page.locator('[data-testid^="agent-row-"]');
  const count = await agents.count();
  await closeAgentList(page);
  return count;
};

export const listCustomAgentNames = async (page: Page) => {
  await openAgentList(page);
  const agents = page.locator('[data-testid^="agent-row-"]');
  const names = await agents.evaluateAll((elements) =>
    elements
      .map((element) => element.getAttribute('data-agent-name') ?? '')
      .filter((name) => name.length > 0),
  );
  await closeAgentList(page);
  return names;
};

export const ensureCustomAgents = async (page: Page, targetCount: number) => {
  const existingCount = await getCustomAgentCount(page);
  const needed = Math.max(0, targetCount - existingCount);
  if (needed === 0) {
    return;
  }
  const seed = Date.now();
  for (let i = 0; i < needed; i += 1) {
    await createCustomAgentWithOptions(page, `E2E Werewolf ${seed + i}`, {
      ensureCharacter: false,
    });
  }
  const finalCount = await getCustomAgentCount(page);
  if (finalCount < targetCount) {
    throw new Error(`Expected ${targetCount} agents but found ${finalCount}.`);
  }
};

export const ensureNamedAgents = async (page: Page, agentNames: string[]) => {
  const existingNames = new Set(await listCustomAgentNames(page));
  const missingNames = agentNames.filter((name) => !existingNames.has(name));
  for (const name of missingNames) {
    await createCustomAgentWithOptions(page, name, { ensureCharacter: false });
  }
  const finalNames = new Set(await listCustomAgentNames(page));
  const stillMissing = agentNames.filter((name) => !finalNames.has(name));
  if (stillMissing.length > 0) {
    throw new Error(`Missing expected agents: ${stillMissing.join(', ')}`);
  }
};

export const openWerewolfPanel = async (page: Page) => {
  await page.getByTestId('open-werewolf-panel').click();
  await expect(page.getByTestId('werewolf-panel')).toBeVisible();
};

export const joinWerewolfQueue = async (page: Page, targetCount = 8) => {
  const list = page.getByTestId('werewolf-queue-list');
  await expect(list).toBeVisible({ timeout: 60000 });
  const rows = list.locator('[data-testid^="werewolf-queue-agent-"]');
  const total = await rows.count();
  if (total < targetCount) {
    throw new Error(`Only ${total} queueable agents available; need ${targetCount}.`);
  }
  const joinButtons = page.locator('[data-testid^="werewolf-queue-join-"]');
  const joinable = await joinButtons.count();
  const alreadyQueued = total - joinable;
  const needed = Math.max(0, targetCount - alreadyQueued);
  if (needed > joinable) {
    throw new Error(`Only ${joinable} joinable agents available; need ${needed}.`);
  }
  for (let i = 0; i < needed; i += 1) {
    const button = page.locator('[data-testid^="werewolf-queue-join-"]').first();
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeEnabled({ timeout: 20000 });
    await button.click();
    await expect(button).toBeHidden({ timeout: 20000 });
  }
};

export const joinWerewolfQueueByName = async (page: Page, agentNames: string[]) => {
  const list = page.getByTestId('werewolf-queue-list');
  await expect(list).toBeVisible({ timeout: 60000 });
  const inMatchAgents: string[] = [];
  const rowsByName = new Map<string, ReturnType<Page['locator']>>();

  for (const name of agentNames) {
    const row = list
      .locator('[data-testid^="werewolf-queue-agent-"]')
      .filter({ hasText: name })
      .first();
    await expect(row).toBeVisible({ timeout: 20000 });
    await row.scrollIntoViewIfNeeded();
    rowsByName.set(name, row);
    const joinButton = row.locator('[data-testid^="werewolf-queue-join-"]');
    const leaveButton = row.locator('[data-testid^="werewolf-queue-leave-"]');
    const inMatchButton = row.getByRole('button', { name: /in match/i });
    if ((await inMatchButton.count()) > 0) {
      inMatchAgents.push(name);
      continue;
    }
    if ((await joinButton.count()) > 0 || (await leaveButton.count()) > 0) {
      continue;
    }
    throw new Error(`Queue action unavailable for agent ${name}.`);
  }

  if (inMatchAgents.length > 0) {
    return { inMatchAgents };
  }

  for (const name of agentNames) {
    const row = rowsByName.get(name);
    if (!row) {
      throw new Error(`Queue row missing for agent ${name}.`);
    }
    const joinButton = row.locator('[data-testid^="werewolf-queue-join-"]');
    if ((await joinButton.count()) > 0) {
      await expect(joinButton).toBeEnabled({ timeout: 20000 });
      await joinButton.click();
      await expect(joinButton).toBeHidden({ timeout: 20000 });
    }
  }

  return { inMatchAgents };
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
