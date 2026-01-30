import { expect, test, type Locator } from '@playwright/test';
import {
  enterWorld,
  ensureSpectatorChatMessage,
  ensureCustomCharacter,
  ensureNamedAgentsViaConvex,
  resolveAgentIdsByName,
  gotoHome,
  joinWerewolfQueueByName,
  openWerewolfPanel,
  removeAgentsById,
} from './utils';

const WEREWOLF_ELIZA_SERVER_URL =
  process.env.E2E_WEREWOLF_ELIZA_SERVER_URL ??
  process.env.E2E_ELIZA_SERVER_URL ??
  'https://fliza-agent-production.up.railway.app';
const WEREWOLF_ELIZA_AUTH_TOKEN =
  process.env.E2E_WEREWOLF_ELIZA_AUTH_TOKEN ?? process.env.E2E_ELIZA_AUTH_TOKEN;
const hasElizaServer = !!WEREWOLF_ELIZA_SERVER_URL;

test.skip(!hasElizaServer, 'Eliza server URL is required for werewolf E2E.');

const MATCH_START_TIMEOUT_MS = 60_000;
const MATCH_END_TIMEOUT_MS = 4 * 60_000;
const DEFAULT_WEREWOLF_AGENT_NAMES = Array.from(
  { length: 8 },
  (_, index) => `E2E Werewolf ${index + 1}`,
);
const DEFAULT_WEREWOLF_AGENT_ID_MAP: Record<string, string> = {
  'E2E Werewolf 1': 'c7cab9c8-6c71-03a6-bd21-a694c8776023',
  'E2E Werewolf 2': '5f72a139-5879-0f35-9da7-90bf5be30be7',
  'E2E Werewolf 3': '63951950-3c9b-0ca8-8308-cab08cbb464f',
  'E2E Werewolf 4': '811e5045-23aa-06eb-9897-30584a587d46',
  'E2E Werewolf 5': '918dcdba-01af-0c4c-9867-3c0f114264f6',
  'E2E Werewolf 6': '998c8655-d945-0fa3-b5df-cef9bb7fae48',
  'E2E Werewolf 7': 'd09c5b1c-9cce-0e90-9b2b-b3364191369a',
  'E2E Werewolf 8': '23337d73-4500-01b6-9eb0-7d9bbd3ea4cc',
};
const configuredNames = process.env.E2E_WEREWOLF_AGENT_NAMES
  ? process.env.E2E_WEREWOLF_AGENT_NAMES.split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
  : null;
const WEREWOLF_AGENT_NAMES = configuredNames ?? DEFAULT_WEREWOLF_AGENT_NAMES;

const parseAgentIdMap = (raw: string | undefined, agentNames: string[]) => {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('Agent map env must be valid JSON mapping names to agent IDs.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Agent map env must be a JSON object mapping names to agent IDs.');
  }
  const map = parsed as Record<string, string>;
  for (const name of agentNames) {
    if (!map[name]) {
      throw new Error(`Agent map env is missing an entry for "${name}".`);
    }
  }
  return map;
};

const parseAgentIdList = (raw: string | undefined, agentNames: string[]) => {
  if (!raw) {
    return null;
  }
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (ids.length < agentNames.length) {
    throw new Error(
      `Agent id list env must include at least ${agentNames.length} IDs (found ${ids.length}).`,
    );
  }
  const map: Record<string, string> = {};
  agentNames.forEach((name, index) => {
    map[name] = ids[index]!;
  });
  return map;
};

const resolveWerewolfAgentIdMap = (agentNames: string[]) => {
  const map =
    parseAgentIdMap(process.env.E2E_WEREWOLF_AGENT_MAP, agentNames) ??
    parseAgentIdList(process.env.E2E_WEREWOLF_AGENT_IDS, agentNames) ??
    parseAgentIdMap(process.env.E2E_ELIZA_AGENT_MAP, agentNames) ??
    parseAgentIdList(process.env.E2E_ELIZA_AGENT_IDS, agentNames) ??
    DEFAULT_WEREWOLF_AGENT_ID_MAP;
  for (const name of agentNames) {
    if (!map[name]) {
      throw new Error(
        `Missing Eliza agent id for "${name}". Set E2E_WEREWOLF_AGENT_MAP or E2E_WEREWOLF_AGENT_IDS.`,
      );
    }
  }
  return map;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildAgentNamePattern = (names: string[]) =>
  new RegExp(names.map(escapeRegExp).join('|'), 'i');

const assertSpectatorChat = async (
  spectatorPanel: Locator,
  agentNames: string[],
  timeoutMs: number,
) => {
  const chatFilter = spectatorPanel.getByRole('button', { name: /^chat$/i });
  if (await chatFilter.isVisible()) {
    await chatFilter.click();
  }
  const agentPattern = buildAgentNamePattern(agentNames);
  const messageEntries = spectatorPanel.locator(
    '[data-testid="werewolf-transcript-entry"][data-entry-kind="message"]',
  );
  await expect
    .poll(async () => messageEntries.count(), { timeout: timeoutMs })
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () => messageEntries.filter({ hasText: agentPattern }).count(),
      { timeout: timeoutMs },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        spectatorPanel
          .locator(
            '[data-testid="werewolf-transcript-entry"][data-entry-kind]:not([data-entry-kind="message"]):not([data-entry-kind="vote"])',
          )
          .count(),
      { timeout: 20000 },
    )
    .toBe(0);
};

test.describe('werewolf full match', () => {
  test.setTimeout(MATCH_END_TIMEOUT_MS + 60_000);

  test('play a full werewolf game', async ({ page }) => {
    await gotoHome(page);
    await enterWorld(page);

    await ensureCustomCharacter(page);
    const elizaAgentMap = resolveWerewolfAgentIdMap(WEREWOLF_AGENT_NAMES);
    await ensureNamedAgentsViaConvex(page, WEREWOLF_AGENT_NAMES, {
      elizaAgentIdsByName: elizaAgentMap,
      elizaServerUrl: WEREWOLF_ELIZA_SERVER_URL,
      elizaAuthToken: WEREWOLF_ELIZA_AUTH_TOKEN,
    });
    const agentIdsByName = await resolveAgentIdsByName(WEREWOLF_AGENT_NAMES);

    await openWerewolfPanel(page);
    const { inMatchAgents } = await joinWerewolfQueueByName(page, WEREWOLF_AGENT_NAMES, {
      agentIdsByName,
    });
    if (inMatchAgents.length > 0) {
      test.info().annotations.push({
        type: 'note',
        description: `Using existing match for agents: ${inMatchAgents.join(', ')}`,
      });
    }

    await page.getByTestId('werewolf-tab-matches').click();
    const matchCard = page.locator('[data-testid^="werewolf-match-"]').first();
    await expect(matchCard).toBeVisible({ timeout: MATCH_START_TIMEOUT_MS });
    const matchTestId = await matchCard.getAttribute('data-testid');
    const matchId = matchTestId?.replace('werewolf-match-', '');
    if (!matchId) {
      throw new Error('Unable to resolve match id from matches list.');
    }
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
    await expect(page.getByTestId('werewolf-key-moments')).toBeVisible();
    await expect(page.getByTestId('werewolf-spectator-summary')).toBeVisible();

    const spectatorPanel = page.getByTestId('werewolf-spectator-panel');
    const chatSeed = await ensureSpectatorChatMessage(matchId, WEREWOLF_AGENT_NAMES, {
      timeoutMs: 120_000,
    });
    if (chatSeed.injected) {
      test.info().annotations.push({
        type: 'note',
        description: `Injected spectator chat message as ${chatSeed.playerName ?? 'unknown player'}.`,
      });
    }
    await assertSpectatorChat(
      spectatorPanel,
      WEREWOLF_AGENT_NAMES,
      MATCH_END_TIMEOUT_MS,
    );

    await expect(page.getByTestId('werewolf-spectator-phase')).toHaveText(/ended/i, {
      timeout: MATCH_END_TIMEOUT_MS,
    });

    await spectatorPanel.getByRole('button', { name: 'Close' }).click();
    await expect(spectatorPanel).toBeHidden();

    await removeAgentsById(page, Object.values(agentIdsByName));

    await openWerewolfPanel(page);
    await page.getByTestId('werewolf-tab-matches').click();
    await page.getByTestId('werewolf-matches-filter-ended').click();
    const replayCard = page.getByTestId(`werewolf-match-${matchId}`);
    await expect(replayCard).toBeVisible({ timeout: 60000 });
    await replayCard.getByTestId(`werewolf-watch-${matchId}`).click();
    await expect(page.getByTestId('werewolf-spectator-panel')).toBeVisible();
    await expect(page.getByTestId('werewolf-spectator-summary')).toBeVisible();
    const replayRoster = page.getByTestId('werewolf-roster');
    await expect(replayRoster).toBeVisible();
    await expect
      .poll(
        async () =>
          replayRoster
            .locator('[data-testid^="werewolf-roster-player-"]')
            .count(),
        { timeout: 60000 },
      )
      .toBe(WEREWOLF_AGENT_NAMES.length);
    for (const name of WEREWOLF_AGENT_NAMES) {
      await expect(replayRoster).toContainText(name, { timeout: 60000 });
    }
    const replaySpectatorPanel = page.getByTestId('werewolf-spectator-panel');
    await assertSpectatorChat(
      replaySpectatorPanel,
      WEREWOLF_AGENT_NAMES,
      60_000,
    );
    await expect
      .poll(
        async () =>
          page
            .locator('[data-testid="werewolf-transcript-entry"][data-entry-kind="message"]')
            .count(),
        { timeout: 60000 },
      )
      .toBeGreaterThan(0);
  });
});
