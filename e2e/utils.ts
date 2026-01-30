import { expect, type Locator, type Page } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';

const spritePath = 'public/assets/characters/char-f1.png';
const DEFAULT_FLIZA_ELIZA_SERVER_URL = 'https://fliza-agent-production.up.railway.app';
const DEFAULT_FLIZA_ELIZA_AGENT_ID = 'c7cab9c8-6c71-03a6-bd21-a694c8776023';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForInputProcessed = async (
  inputId: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
) => {
  const { timeoutMs = 90_000, pollIntervalMs = 1000 } = options;
  const client = getConvexClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await client.query(api.aiTown.main.inputStatus, { inputId });
    if (status) {
      if (status.kind === 'error') {
        throw new Error(status.message);
      }
      return status.value;
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for input ${inputId} to process.`);
};

type ElizaAgentOption = {
  value: string;
  label: string;
};

const normalizeElizaAgentLabel = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const findElizaAgentOption = (options: ElizaAgentOption[], agentName: string) => {
  const needle = normalizeElizaAgentLabel(agentName);
  const exactMatches = options.filter(
    (option) => normalizeElizaAgentLabel(option.label) === needle,
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const suffixMatches = options.filter((option) => {
    const label = normalizeElizaAgentLabel(option.label);
    return label.endsWith(`- ${needle}`) || label.endsWith(`– ${needle}`);
  });
  if (suffixMatches.length === 1) {
    return suffixMatches[0];
  }

  const startsWithMatches = options.filter((option) =>
    normalizeElizaAgentLabel(option.label).startsWith(needle),
  );
  if (startsWithMatches.length === 1) {
    return startsWithMatches[0];
  }

  const includesMatches = options.filter((option) =>
    normalizeElizaAgentLabel(option.label).includes(needle),
  );
  if (includesMatches.length === 1) {
    return includesMatches[0];
  }

  if (includesMatches.length > 1) {
    const labels = includesMatches.map((option) => option.label).join(', ');
    throw new Error(
      `Multiple Eliza agents match "${agentName}": ${labels}. Set E2E_ELIZA_AGENT_MAP to disambiguate.`,
    );
  }

  return null;
};

const getElizaAgentOptions = async (select: Locator) =>
  select.evaluate((node) => {
    const selectNode = node as HTMLSelectElement;
    return Array.from(selectNode.options)
      .filter((opt) => opt.value)
      .map((opt) => ({
        value: opt.value,
        label: (opt.textContent ?? '').trim(),
      }));
  });

const loadElizaAgentOptions = async (select: Locator) => {
  await expect
    .poll(async () => {
      const optionCount = await select.evaluate((node) => {
        const selectNode = node as HTMLSelectElement;
        return Array.from(selectNode.options).filter((opt) => opt.value).length;
      });
      return optionCount;
    }, { timeout: 20000 })
    .toBeGreaterThan(0);

  return getElizaAgentOptions(select);
};

export const loadElizaAgentsWithRetry = async (
  page: Page,
  options: { timeoutMs?: number; retryIntervalMs?: number } = {},
) => {
  const { timeoutMs = 180_000, retryIntervalMs = 5000 } = options;
  const loadButton = page.getByTestId('agent-eliza-load');
  const select = page.getByTestId('agent-eliza-select');
  const status = page.getByTestId('agent-eliza-verify-result');
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastStatus = '';

  const hasOptions = async () =>
    (await select.evaluate((node) => {
      const selectNode = node as HTMLSelectElement;
      return Array.from(selectNode.options).filter((opt) => opt.value).length;
    })) > 0;

  if ((await select.isEnabled().catch(() => false)) && (await hasOptions())) {
    return;
  }

  while (Date.now() < deadline) {
    attempt += 1;
    await expect(loadButton).toBeEnabled({ timeout: 20000 });
    await loadButton.click();

    try {
      await expect(select).toBeEnabled({ timeout: 20000 });
      return;
    } catch (error) {
      try {
        lastStatus = (await status.textContent({ timeout: 1000 }))?.trim() ?? '';
      } catch {
        lastStatus = '';
      }
      const waitMs = Math.min(retryIntervalMs * attempt, 20000);
      if (Date.now() + waitMs >= deadline) {
        break;
      }
      await page.waitForTimeout(waitMs);
    }
  }

  const suffix = lastStatus ? ` Last status: ${lastStatus}` : '';
  throw new Error(`Unable to load Eliza agents within ${timeoutMs}ms.${suffix}`);
};

const getConvexUrl = () => {
  if (process.env.VITE_CONVEX_URL) {
    return process.env.VITE_CONVEX_URL;
  }
  const host = process.env.E2E_CONVEX_HOST ?? '127.0.0.1';
  const port = process.env.E2E_CONVEX_PORT ?? '3212';
  return `http://${host}:${port}`;
};

let convexClient: ConvexHttpClient | null = null;
const getConvexClient = () => {
  if (!convexClient) {
    convexClient = new ConvexHttpClient(getConvexUrl());
  }
  return convexClient;
};

export const isSharedElizaServer = () => {
  const url = process.env.E2E_ELIZA_SERVER_URL ?? '';
  if (!url) {
    return false;
  }
  return !/(localhost|127\.0\.0\.1)/i.test(url);
};

export const shouldPreserveAgents = () => {
  const override = process.env.E2E_ELIZA_PRESERVE_AGENTS?.toLowerCase();
  if (override === 'true' || override === '1') {
    return true;
  }
  if (override === 'false' || override === '0') {
    return false;
  }
  const url = process.env.E2E_ELIZA_SERVER_URL ?? '';
  if (!url) {
    return false;
  }
  return !/(localhost|127\.0\.0\.1)/i.test(url);
};

const parseElizaAgentIdMap = (agentNames: string[]) => {
  const rawMap = process.env.E2E_ELIZA_AGENT_MAP;
  if (rawMap) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMap);
    } catch (error) {
      throw new Error('E2E_ELIZA_AGENT_MAP must be valid JSON mapping names to agent IDs.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('E2E_ELIZA_AGENT_MAP must be a JSON object mapping names to agent IDs.');
    }
    const map = parsed as Record<string, string>;
    for (const name of agentNames) {
      if (!map[name]) {
        throw new Error(`E2E_ELIZA_AGENT_MAP is missing an entry for "${name}".`);
      }
    }
    return map;
  }

  const rawList = process.env.E2E_ELIZA_AGENT_IDS;
  if (rawList) {
    const ids = rawList
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (ids.length < agentNames.length) {
      throw new Error(
        `E2E_ELIZA_AGENT_IDS must include at least ${agentNames.length} IDs (found ${ids.length}).`,
      );
    }
    const map: Record<string, string> = {};
    agentNames.forEach((name, index) => {
      map[name] = ids[index];
    });
    return map;
  }

  return null;
};

export const resolveElizaAgentIdFromEnv = (agentName?: string) => {
  const rawMap = process.env.E2E_ELIZA_AGENT_MAP;
  if (rawMap && agentName) {
    try {
      const parsed = JSON.parse(rawMap);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const map = parsed as Record<string, string>;
        if (map[agentName]) {
          return map[agentName];
        }
      }
    } catch {
      // Ignore here; parseElizaAgentIdMap handles strict validation.
    }
  }
  const rawList = process.env.E2E_ELIZA_AGENT_IDS;
  if (rawList) {
    const ids = rawList
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (ids.length > 0) {
      return ids[0];
    }
  }
  if (process.env.E2E_ELIZA_AGENT_ID) {
    return process.env.E2E_ELIZA_AGENT_ID;
  }
  const url = process.env.E2E_ELIZA_SERVER_URL ?? '';
  if (url && url.replace(/\/+$/, '') === DEFAULT_FLIZA_ELIZA_SERVER_URL) {
    return process.env.E2E_ELIZA_DEFAULT_AGENT_ID ?? DEFAULT_FLIZA_ELIZA_AGENT_ID;
  }
  return process.env.E2E_ELIZA_DEFAULT_AGENT_ID;
};

const selectElizaAgentOption = async (
  page: Page,
  agentName: string,
  agentId?: string,
) => {
  const select = page.getByTestId('agent-eliza-select');
  const options = await loadElizaAgentOptions(select);
  if (agentId) {
    const match = options.find((option) => option.value === agentId);
    if (!match) {
      const labels = options.map((option) => option.label).join(', ');
      throw new Error(
        `Eliza agent id "${agentId}" not found in loaded options. Available: ${labels}`,
      );
    }
    await select.selectOption(agentId);
    return;
  }
  const match = findElizaAgentOption(options, agentName);
  if (!match) {
    throw new Error(`Unable to find agent option matching "${agentName}".`);
  }
  await select.selectOption(match.value);
};

export const gotoHome = async (page: Page) => {
  await page.goto('/ai-town/');
};

export const ensureWorldRunning = async (timeoutMs = 60_000) => {
  const client = getConvexClient();
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      await client.mutation(api.testing.resume, {});
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw new Error(`Unable to resume world within ${timeoutMs}ms. ${String(lastError ?? '')}`);
};

export const enterWorld = async (page: Page) => {
  await ensureWorldRunning();
  const gameView = page.getByTestId('game-view');
  if (await gameView.isVisible().catch(() => false)) {
    return;
  }
  const enterButton = page.getByTestId('enter-world');
  await expect(enterButton).toBeVisible({ timeout: 20000 });
  await enterButton.click();
  await expect(gameView).toBeVisible({ timeout: 20000 });
};

export const openJoinDialog = async (
  page: Page,
  options: { allowReload?: boolean } = {},
) => {
  const joinButton = page.getByTestId('join-world');
  const joinDialog = page.getByTestId('join-world-dialog');
  if (await joinDialog.isVisible().catch(() => false)) {
    return;
  }
  await expect(joinButton).toBeVisible({ timeout: 20000 });
  await expect(joinButton).not.toHaveClass(/pointer-events-none/, { timeout: 20000 });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const currentText = (await joinButton.textContent()) ?? '';
    if (currentText.includes('Release')) {
      await joinButton.click();
      await expect(joinButton).toHaveText(/Take Over/, { timeout: 20000 });
    }
    await joinButton.scrollIntoViewIfNeeded();
    await joinButton.click({ force: true });
    try {
      await expect(joinDialog).toBeVisible({ timeout: 5000 });
      return;
    } catch {
      await page
        .evaluate(() => {
          const el = document.querySelector('[data-testid="join-world"]');
          if (el instanceof HTMLElement) {
            el.click();
          }
        })
        .catch(() => {});
      try {
        await expect(joinDialog).toBeVisible({ timeout: 5000 });
        return;
      } catch {
        // fall through
      }
      try {
        await joinButton.focus();
        await page.keyboard.press('Enter');
        await expect(joinDialog).toBeVisible({ timeout: 5000 });
        return;
      } catch {
        // fall through
      }
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  if (options.allowReload !== false) {
    await page.reload();
    await enterWorld(page);
    await openJoinDialog(page, { allowReload: false });
    return;
  }

  await expect(joinDialog).toBeVisible({ timeout: 20000 });
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

export const createCustomAgent = async (
  page: Page,
  name: string,
  options: CreateAgentOptions = {},
) => {
  await createCustomAgentWithOptions(page, name, options);
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
  elizaAgentId?: string;
  elizaAuthToken?: string;
};

export const createCustomAgentWithOptions = async (
  page: Page,
  name: string,
  options: CreateAgentOptions = {},
) => {
  const {
    ensureCharacter = true,
    elizaServerUrl,
    elizaAgentId,
    elizaAuthToken,
  } = options;
  if (ensureCharacter) {
    await ensureCustomCharacter(page);
  }
  await openCreateAgent(page);
  const elizaUrl = elizaServerUrl ?? process.env.E2E_ELIZA_SERVER_URL;
  const agentId = elizaAgentId ?? resolveElizaAgentIdFromEnv(name);
  const elizaToken = elizaAuthToken ?? process.env.E2E_ELIZA_AUTH_TOKEN;
  if (!elizaUrl) {
    throw new Error(
      'Missing Eliza server URL. Set E2E_ELIZA_SERVER_URL or pass elizaServerUrl to createCustomAgentWithOptions.',
    );
  }
  await page.getByTestId('agent-eliza-url').fill(elizaUrl);
  if (elizaToken) {
    await page.getByTestId('agent-eliza-api-key').fill(elizaToken);
  }
  await loadElizaAgentsWithRetry(page);
  await selectElizaAgentOption(page, name, agentId);
  const dialog = page.getByTestId('create-agent-dialog');
  const errorBox = page.getByTestId('agent-error');
  const createButton = page.getByTestId('agent-create');
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await createButton.click();
    try {
      await expect(dialog).toBeHidden({ timeout: 60000 });
      return;
    } catch (error) {
      const errorText = (await errorBox.textContent())?.toLowerCase() ?? '';
      if (errorText.includes('world is still processing')) {
        await page.waitForTimeout(2000);
        continue;
      }
      throw error;
    }
  }

  throw new Error('Agent creation did not complete after multiple attempts.');
};

export const fetchElizaAgentIdMap = async (
  page: Page,
  agentNames: string[],
  options: { elizaServerUrl?: string; elizaAuthToken?: string } = {},
) => {
  await openCreateAgent(page);
  const elizaUrl = options.elizaServerUrl ?? process.env.E2E_ELIZA_SERVER_URL;
  const elizaToken = options.elizaAuthToken ?? process.env.E2E_ELIZA_AUTH_TOKEN;
  if (!elizaUrl) {
    throw new Error('Missing Eliza server URL. Set E2E_ELIZA_SERVER_URL.');
  }
  await page.getByTestId('agent-eliza-url').fill(elizaUrl);
  if (elizaToken) {
    await page.getByTestId('agent-eliza-api-key').fill(elizaToken);
  }
  await loadElizaAgentsWithRetry(page);
  const select = page.getByTestId('agent-eliza-select');
  const optionList = await loadElizaAgentOptions(select);

  const map: Record<string, string> = {};
  for (const name of agentNames) {
    const match = findElizaAgentOption(optionList, name);
    if (!match) {
      throw new Error(`Unable to find Eliza agent option for "${name}".`);
    }
    map[name] = match.value;
  }

  await page.getByTestId('agent-cancel').click();
  await expect(page.getByTestId('create-agent-dialog')).toBeHidden();

  return map;
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

export const listCustomAgentEntries = async (page: Page) => {
  await openAgentList(page);
  const agents = page.locator('[data-testid^="agent-row-"]');
  const entries = await agents.evaluateAll((elements) =>
    elements
      .map((element) => {
        const testId = element.getAttribute('data-testid') ?? '';
        const agentId = testId.replace('agent-row-', '');
        return {
          agentId: agentId.length > 0 ? agentId : null,
          name: element.getAttribute('data-agent-name') ?? '',
        };
      })
      .filter((entry) => entry.agentId),
  );
  await closeAgentList(page);
  return entries as Array<{ agentId: string; name: string }>;
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

export const ensureNamedAgents = async (
  page: Page,
  agentNames: string[],
  options: {
    elizaAgentIdsByName?: Record<string, string>;
    elizaServerUrl?: string;
    elizaAuthToken?: string;
  } = {},
) => {
  const agentIdMap =
    options.elizaAgentIdsByName ?? parseElizaAgentIdMap(agentNames);
  const existingNames = new Set(await listCustomAgentNames(page));
  const missingNames = agentNames.filter((name) => !existingNames.has(name));
  for (const name of missingNames) {
    await createCustomAgentWithOptions(page, name, {
      ensureCharacter: false,
      elizaAgentId: agentIdMap ? agentIdMap[name] : undefined,
      elizaServerUrl: options.elizaServerUrl,
      elizaAuthToken: options.elizaAuthToken,
    });
  }
  const finalNames = new Set(await listCustomAgentNames(page));
  const stillMissing = agentNames.filter((name) => !finalNames.has(name));
  if (stillMissing.length > 0) {
    throw new Error(`Missing expected agents: ${stillMissing.join(', ')}`);
  }
};

export const ensureNamedAgentsViaConvex = async (
  page: Page,
  agentNames: string[],
  options: {
    elizaAgentIdsByName: Record<string, string>;
    elizaServerUrl: string;
    elizaAuthToken?: string;
    character?: string;
    identityForName?: (name: string) => string;
    plan?: string;
    personality?: string[];
  },
) => {
  const {
    elizaAgentIdsByName,
    elizaServerUrl,
    elizaAuthToken,
    character = 'f1',
    identityForName = (name: string) => `${name} is an ElizaOS agent.`,
    plan = 'Participate in Eliza Town.',
    personality = [],
  } = options;

  await ensureWorldRunning();
  const existingNames = new Set(await listCustomAgentNames(page));
  const missingNames = agentNames.filter((name) => !existingNames.has(name));
  if (missingNames.length === 0) {
    return;
  }

  const client = getConvexClient();
  const worldStatus = await client.query(api.world.defaultWorldStatus, {});
  const worldId = worldStatus?.worldId;
  if (!worldId) {
    throw new Error('Unable to resolve default world id for agent setup.');
  }

  for (const name of missingNames) {
    const elizaAgentId = elizaAgentIdsByName[name];
    if (!elizaAgentId) {
      throw new Error(`Missing Eliza agent id for "${name}".`);
    }
    const result = await client.action(api.elizaAgent.actions.connectExistingElizaAgent, {
      worldId,
      name,
      character,
      identity: identityForName(name),
      plan,
      personality,
      elizaAgentId,
      elizaServerUrl,
      elizaAuthToken,
    });
    if (result?.inputId) {
      try {
        await waitForInputProcessed(result.inputId, { timeoutMs: 180_000 });
      } catch (error) {
        await ensureWorldRunning();
        await waitForInputProcessed(result.inputId, { timeoutMs: 180_000 });
      }
    }
  }

  await expect
    .poll(async () => {
      const names = await listCustomAgentNames(page);
      return agentNames.every((name) => names.includes(name));
    }, { timeout: 120_000 })
    .toBeTruthy();
};

export const resolveAgentIdsByName = async (
  agentNames: string[],
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
) => {
  const { timeoutMs = 60_000, pollIntervalMs = 2000 } = options;
  const client = getConvexClient();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const worldStatus = await client.query(api.world.defaultWorldStatus, {});
    const worldId = worldStatus?.worldId;
    if (!worldId) {
      await sleep(pollIntervalMs);
      continue;
    }
    const [worldState, descriptions] = await Promise.all([
      client.query(api.world.worldState, { worldId }),
      client.query(api.world.gameDescriptions, { worldId }),
    ]);
    const nameByPlayerId = new Map(
      descriptions.playerDescriptions.map((desc) => [desc.playerId, desc.name]),
    );
    const agentIdsByName: Record<string, string> = {};
    for (const agent of worldState.world.agents) {
      const name = nameByPlayerId.get(agent.playerId);
      if (!name) {
        continue;
      }
      if (agentNames.includes(name) && !agentIdsByName[name]) {
        agentIdsByName[name] = agent.id;
      }
    }
    const missing = agentNames.filter((name) => !agentIdsByName[name]);
    if (missing.length === 0) {
      return agentIdsByName;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`Unable to resolve agent IDs for: ${agentNames.join(', ')}`);
};

export const removeAgentsByName = async (page: Page, agentNames: string[]) => {
  await openAgentList(page);
  const uniqueNames = Array.from(new Set(agentNames));
  for (const name of uniqueNames) {
    let remaining = await page.locator(`[data-agent-name="${name}"]`).count();
    let attempts = 0;
    while (remaining > 0 && attempts < 10) {
      const row = page.locator(`[data-agent-name="${name}"]`).first();
      const removeButton = row.locator('[data-testid^="agent-remove-"]');
      await expect(removeButton).toBeVisible({ timeout: 20000 });
      if (await removeButton.isDisabled()) {
        throw new Error(`Agent "${name}" is controlled by someone else and cannot be removed.`);
      }
      await row.scrollIntoViewIfNeeded();
      await removeButton.click({ force: true });
      const confirmButton = row.locator('[data-testid^="agent-confirm-remove-"]');
      await confirmButton.click({ force: true });
      await expect
        .poll(async () => page.locator(`[data-agent-name="${name}"]`).count(), {
          timeout: 60000,
        })
        .toBeLessThan(remaining);
      remaining = await page.locator(`[data-agent-name="${name}"]`).count();
      attempts += 1;
    }
  }
  await page.getByTestId('agent-list-done').click();
  await expect(page.getByTestId('agent-list-dialog')).toBeHidden();
};

export const removeAgentsById = async (page: Page, agentIds: string[]) => {
  await openAgentList(page);
  const uniqueIds = Array.from(new Set(agentIds));
  for (const agentId of uniqueIds) {
    const row = page.getByTestId(`agent-row-${agentId}`);
    if ((await row.count()) === 0) {
      continue;
    }
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      if ((await row.count()) === 0) {
        break;
      }
      const confirmButton = row.locator('[data-testid^="agent-confirm-remove-"]');
      if ((await confirmButton.count()) > 0) {
        await row.scrollIntoViewIfNeeded();
        await confirmButton.scrollIntoViewIfNeeded();
        await confirmButton.click({ force: true });
      } else {
        const removeButton = row.locator('[data-testid^="agent-remove-"]');
        await expect(removeButton).toBeVisible({ timeout: 20000 });
        if (await removeButton.isDisabled()) {
          throw new Error(`Agent "${agentId}" is controlled by someone else and cannot be removed.`);
        }
        await row.scrollIntoViewIfNeeded();
        await removeButton.click({ force: true });
        await expect(confirmButton).toBeVisible({ timeout: 20000 });
        await confirmButton.scrollIntoViewIfNeeded();
        await confirmButton.click({ force: true });
      }
      try {
        await expect
          .poll(async () => row.count(), { timeout: 60000 })
          .toBe(0);
        break;
      } catch (error) {
        attempts += 1;
        if (attempts >= maxAttempts) {
          throw error;
        }
        await closeAgentList(page);
        await openAgentList(page);
      }
    }
  }
  await page.getByTestId('agent-list-done').click();
  await expect(page.getByTestId('agent-list-dialog')).toBeHidden();
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
    const row = button
      .locator('xpath=ancestor::*[starts-with(@data-testid, "werewolf-queue-agent-")]')
      .first();
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeEnabled({ timeout: 20000 });
    await button.click();
    await expect
      .poll(async () => {
        if ((await row.locator('[data-testid^="werewolf-queue-leave-"]').count()) > 0) {
          return true;
        }
        if ((await row.getByRole('button', { name: /in match/i }).count()) > 0) {
          return true;
        }
        const joinCount = await row.locator('[data-testid^="werewolf-queue-join-"]').count();
        return joinCount === 0;
      }, { timeout: 60000 })
      .toBeTruthy();
  }
};

export const joinWerewolfQueueByName = async (
  page: Page,
  agentNames: string[],
  options: { agentIdsByName?: Record<string, string> } = {},
) => {
  const list = page.getByTestId('werewolf-queue-list');
  await expect(list).toBeVisible({ timeout: 60000 });
  const inMatchAgents: string[] = [];
  const rowsByName = new Map<string, ReturnType<Page['locator']>>();

  for (const name of agentNames) {
    const agentId = options.agentIdsByName?.[name];
    const row = agentId
      ? list.locator(`[data-testid="werewolf-queue-agent-${agentId}"]`)
      : list
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
      await expect
        .poll(async () => {
          if ((await row.locator('[data-testid^="werewolf-queue-leave-"]').count()) > 0) {
            return true;
          }
          if ((await row.getByRole('button', { name: /in match/i }).count()) > 0) {
            return true;
          }
          const joinCount = await row.locator('[data-testid^="werewolf-queue-join-"]').count();
          return joinCount === 0;
        }, { timeout: 60000 })
        .toBeTruthy();
    }
  }

  return { inMatchAgents };
};

export const takeOverFirstAgent = async (page: Page) => {
  await openJoinDialog(page);
  const joinDialog = page.getByTestId('join-world-dialog');
  const agentButtons = page.locator('[data-testid^="join-world-agent-"]');
  const buttonCount = await agentButtons.count();
  if (buttonCount === 0) {
    throw new Error('No available agents to take over.');
  }

  const waitForTakeOver = async (timeoutMs: number) => {
    await expect
      .poll(async () => {
        const joinText = (await page.getByTestId('join-world').textContent()) ?? '';
        const humanId = (await page.getByTestId('test-human-player-id').textContent()) ?? '';
        return /Release/i.test(joinText) && humanId.trim() !== 'not-playing';
      }, { timeout: timeoutMs })
      .toBeTruthy();
  };

  const maxAttempts = Math.min(3, buttonCount);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await agentButtons.nth(attempt).click();
    await page.getByTestId('join-world-takeover').click();
    try {
      await waitForTakeOver(60_000);
      if (await joinDialog.isVisible()) {
        await page.getByTestId('join-world-cancel').click();
        await expect(joinDialog).toBeHidden({ timeout: 20000 });
      }
      return;
    } catch (error) {
      lastError = error as Error;
      if (await joinDialog.isVisible()) {
        const cancelButton = page.getByTestId('join-world-cancel');
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
          await expect(joinDialog).toBeHidden({ timeout: 20000 });
        } else {
          await page.keyboard.press('Escape');
          await expect(joinDialog).toBeHidden({ timeout: 20000 });
        }
      }
      await openJoinDialog(page);
    }
  }

  throw lastError ?? new Error('Unable to take over an agent.');
};

export const takeOverAgentByName = async (page: Page, name: string) => {
  await openJoinDialog(page);
  const joinDialog = page.getByTestId('join-world-dialog');
  const waitForTakeOver = async (timeoutMs: number) => {
    await expect
      .poll(async () => {
        const joinText = (await page.getByTestId('join-world').textContent()) ?? '';
        const humanId = (await page.getByTestId('test-human-player-id').textContent()) ?? '';
        return /Release/i.test(joinText) && humanId.trim() !== 'not-playing';
      }, { timeout: timeoutMs })
      .toBeTruthy();
  };

  const maxAttempts = 3;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const agentButtons = page
      .locator('[data-testid^="join-world-agent-"]')
      .filter({ hasText: name });
    const buttonCount = await agentButtons.count();
    if (buttonCount === 0) {
      throw new Error(`No joinable agents found with name "${name}".`);
    }
    const agentButton = agentButtons.nth(attempt % buttonCount);
    await expect(agentButton).toBeVisible({ timeout: 20000 });
    await agentButton.click();
    await page.getByTestId('join-world-takeover').click();
    try {
      await waitForTakeOver(60_000);
      if (await joinDialog.isVisible()) {
        await page.getByTestId('join-world-cancel').click();
        await expect(joinDialog).toBeHidden({ timeout: 20000 });
      }
      return;
    } catch (error) {
      lastError = error as Error;
      if (await joinDialog.isVisible()) {
        const cancelButton = page.getByTestId('join-world-cancel');
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
          await expect(joinDialog).toBeHidden({ timeout: 20000 });
        } else {
          await page.keyboard.press('Escape');
          await expect(joinDialog).toBeHidden({ timeout: 20000 });
        }
      }
      await openJoinDialog(page);
    }
  }

  throw lastError ?? new Error(`Unable to take over agent "${name}".`);
};

export const releaseAgent = async (page: Page) => {
  const joinButton = page.getByTestId('join-world');
  await expect(joinButton).toBeVisible({ timeout: 20000 });
  await expect(joinButton).not.toHaveClass(/pointer-events-none/, { timeout: 20000 });
  await joinButton.click();
  await expect(joinButton).toHaveText(/Take Over/, { timeout: 20000 });
};

export const ensureNoActiveConversation = async (page: Page) => {
  const playerButtons = page.locator('[data-testid^="test-player-select-"]');
  const closeDetails = async () => {
    const closeButton = page.getByTestId('close-player-details');
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await expect(page.getByTestId('player-details-empty')).toBeVisible({ timeout: 20000 });
    }
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const count = await playerButtons.count();
    let cleared = false;
    for (let i = 0; i < count; i += 1) {
      await playerButtons.nth(i).click();
      const cancelInvite = page.getByTestId('cancel-invite');
      if (await cancelInvite.isVisible()) {
        await cancelInvite.click();
        await closeDetails();
        cleared = true;
        break;
      }
      const rejectInvite = page.getByTestId('reject-invite');
      if (await rejectInvite.isVisible()) {
        await rejectInvite.click();
        await closeDetails();
        cleared = true;
        break;
      }
      const leaveConversation = page.getByTestId('leave-conversation');
      if (await leaveConversation.isVisible()) {
        await leaveConversation.click();
        await closeDetails();
        cleared = true;
        break;
      }
    }
    if (!cleared) {
      break;
    }
  }
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

export const selectInvitablePlayer = async (
  page: Page,
  options: { timeoutMs?: number } = {},
) => {
  const timeoutMs = options.timeoutMs ?? 60000;
  const humanLabel = page.getByTestId('test-human-player-id');
  await expect(humanLabel).not.toHaveText('not-playing', { timeout: 20000 });
  const humanId = (await humanLabel.textContent())?.trim();
  const buttons = page.locator('[data-testid^="test-player-select-"]');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const count = await buttons.count();
    for (let i = 0; i < count; i += 1) {
      const button = buttons.nth(i);
      const playerId = await button.getAttribute('data-player-id');
      if (!playerId || playerId === humanId) {
        continue;
      }
      await button.click();
      await expect(page.getByTestId('player-details')).toBeVisible({ timeout: 20000 });
      const canInvite = await page.getByTestId('start-conversation').isVisible();
      if (canInvite) {
        return playerId;
      }
    }
    await page.waitForTimeout(2000);
  }
  return null;
};

type SpectatorChatResult = {
  hadMessages: boolean;
  injected: boolean;
  playerName?: string;
  phase?: string;
};

export const ensureSpectatorChatMessage = async (
  matchId: string,
  agentNames: string[],
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<SpectatorChatResult> => {
  const { timeoutMs = 120_000, pollIntervalMs = 1_000 } = options;
  const client = getConvexClient();
  const deadline = Date.now() + timeoutMs;
  const idempotencyKey = `e2e-spectator-chat-${matchId}-${Date.now()}`;
  let injected = false;
  let injectedBy: string | undefined;

  while (Date.now() < deadline) {
    const { state } = await client.query(api.werewolf.matchGetState, {
      matchId,
      includeRecentPublicMessages: true,
    });
    if (state.recentPublicMessages.length > 0) {
      return { hadMessages: true, injected, playerName: injectedBy, phase: state.phase };
    }

    if (!injected && (state.phase === 'DAY_OPENING' || state.phase === 'DAY_DISCUSSION')) {
      const candidate = state.players.find(
        (player) => agentNames.includes(player.displayName) && player.alive,
      );
      if (candidate) {
        try {
          await client.mutation(api.werewolf.matchSayPublic, {
            matchId,
            playerId: candidate.playerId,
            text: `E2E spectator ping (${new Date().toISOString()})`,
            idempotencyKey,
          });
          injected = true;
          injectedBy = candidate.displayName;
        } catch {
          // Ignore and retry on next poll in case the phase flips.
        }
      }
    }

    await sleep(pollIntervalMs);
  }

  return { hadMessages: false, injected, playerName: injectedBy };
};
