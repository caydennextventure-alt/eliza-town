import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import { jest } from '@jest/globals';
import { getFunctionName } from 'convex/server';
import { createWerewolfToolHandler } from './handlers';

const serverTime = '2024-01-01T00:00:00.000Z';

type ToolArgs = Record<string, unknown>;
type ToolDefinition = {
  name: string;
  outputSchema: Record<string, unknown>;
};

type MockFn = ReturnType<typeof jest.fn<(...args: any[]) => Promise<unknown>>>;

type FakeClient = {
  query: MockFn;
  mutation: MockFn;
};

const TOOL_LIST_PATTERN = /```json\s*([\s\S]*?)```/g;
const toolDefinitions: ToolDefinition[] = (() => {
  const specPath = path.resolve(
    process.cwd(),
    'specs/eliza-town-werewolf-mvp-mcp-spec.md',
  );
  const content = readFileSync(specPath, 'utf8');
  const blocks = Array.from(content.matchAll(TOOL_LIST_PATTERN), (match) => match[1].trim());
  const toolList = blocks.find((block) => block.startsWith('['));
  if (!toolList) {
    throw new Error('Tool list JSON block not found in MCP spec.');
  }
  return JSON.parse(toolList) as ToolDefinition[];
})();

const outputSchemaByName = new Map<string, Record<string, unknown>>(
  toolDefinitions.map((tool) => [tool.name, tool.outputSchema]),
);

const ajv = new Ajv({ allErrors: true });
const validators = new Map<string, ReturnType<typeof ajv.compile>>();

const validateToolOutput = (toolName: string, output: unknown): void => {
  let validate = validators.get(toolName);
  if (!validate) {
    const schema = outputSchemaByName.get(toolName);
    if (!schema) {
      throw new Error(`Missing output schema for tool ${toolName}.`);
    }
    validate = ajv.compile(schema);
    validators.set(toolName, validate);
  }
  const valid = validate(output);
  if (!valid) {
    throw new Error(
      `Schema validation failed for ${toolName}: ${ajv.errorsText(validate.errors)}`,
    );
  }
};

const createClient = (): FakeClient => ({
  query: jest.fn<(...args: any[]) => Promise<unknown>>(),
  mutation: jest.fn<(...args: any[]) => Promise<unknown>>(),
});

describe('createWerewolfToolHandler', () => {
  it('dispatches queue.join to queueJoin mutation', async () => {
    const client = createClient();
    client.mutation.mockResolvedValue({
      queue: {
        queueId: 'werewolf-default',
        position: 1,
        size: 1,
        requiredPlayers: 8,
        status: 'WAITING',
        estimatedStartSeconds: 30,
      },
      matchAssignment: null,
    });

    const handler = createWerewolfToolHandler({
      client,
      playerId: 'p:1',
      getServerTime: () => serverTime,
    });

    const response = await handler({
      params: {
        name: 'et.werewolf.queue.join',
        arguments: {
          queueId: 'werewolf-default',
          preferredDisplayName: 'Ralph',
          idempotencyKey: 'queue-key-123',
        },
      },
    });

    expect(client.mutation).toHaveBeenCalledTimes(1);
    const [fn, args] = client.mutation.mock.calls[0] as [unknown, ToolArgs];
    expect(getFunctionName(fn as any)).toBe('werewolf:queueJoin');
    expect(args).toEqual({
      queueId: 'werewolf-default',
      preferredDisplayName: 'Ralph',
      idempotencyKey: 'queue-key-123',
      playerId: 'p:1',
    });
    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toBe('ok');
    expect(response.structuredContent).toEqual({
      ok: true,
      serverTime,
      queue: {
        queueId: 'werewolf-default',
        position: 1,
        size: 1,
        requiredPlayers: 8,
        status: 'WAITING',
        estimatedStartSeconds: 30,
      },
      matchAssignment: null,
      error: null,
    });
  });

  it('dispatches match.get_state to matchGetState query', async () => {
    const client = createClient();
    client.query.mockResolvedValue({
      state: {
        matchId: 'match-1',
        phase: 'DAY_DISCUSSION',
        dayNumber: 1,
        phaseEndsAt: '2024-01-01T00:00:10.000Z',
        players: [],
        publicSummary: 'Summary',
        recentPublicMessages: [],
        you: null,
      },
    });

    const handler = createWerewolfToolHandler({
      client,
      playerId: 'p:1',
      getServerTime: () => serverTime,
    });

    const response = await handler({
      params: {
        name: 'et.werewolf.match.get_state',
        arguments: {
          matchId: 'match-1',
          includeTranscriptSummary: false,
          includeRecentPublicMessages: true,
          recentPublicMessagesLimit: 10,
        },
      },
    });

    expect(client.query).toHaveBeenCalledTimes(1);
    const [fn, args] = client.query.mock.calls[0] as [unknown, ToolArgs];
    expect(getFunctionName(fn as any)).toBe('werewolf:matchGetState');
    expect(args).toEqual({
      matchId: 'match-1',
      includeTranscriptSummary: false,
      includeRecentPublicMessages: true,
      recentPublicMessagesLimit: 10,
      playerId: 'p:1',
    });
    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toBe('ok');
    expect(response.structuredContent).toEqual({
      ok: true,
      serverTime,
      state: {
        matchId: 'match-1',
        phase: 'DAY_DISCUSSION',
        dayNumber: 1,
        phaseEndsAt: '2024-01-01T00:00:10.000Z',
        players: [],
        publicSummary: 'Summary',
        recentPublicMessages: [],
        you: null,
      },
      error: null,
    });
  });

  it('rate limits state/events read tools to 2 calls per second', async () => {
    const client = createClient();
    client.query
      .mockResolvedValueOnce({
        state: {
          matchId: 'match-1',
          phase: 'LOBBY',
          dayNumber: 0,
          phaseEndsAt: '2024-01-01T00:00:10.000Z',
          players: [],
          publicSummary: 'Waiting in lobby.',
          recentPublicMessages: [],
          you: null,
        },
      })
      .mockResolvedValueOnce({
        matchId: 'match-1',
        events: [],
      })
      .mockResolvedValueOnce({
        state: {
          matchId: 'match-1',
          phase: 'LOBBY',
          dayNumber: 0,
          phaseEndsAt: '2024-01-01T00:00:10.000Z',
          players: [],
          publicSummary: 'Waiting in lobby.',
          recentPublicMessages: [],
          you: null,
        },
      });

    let nowMs = 0;
    const handler = createWerewolfToolHandler({
      client,
      playerId: 'p:1',
      getServerTime: () => serverTime,
      getNow: () => nowMs,
    });

    const stateRequest = {
      params: {
        name: 'et.werewolf.match.get_state',
        arguments: { matchId: 'match-1' },
      },
    };

    const eventsRequest = {
      params: {
        name: 'et.werewolf.match.events.get',
        arguments: { matchId: 'match-1', afterEventId: null, limit: 10 },
      },
    };

    await handler(stateRequest);
    nowMs = 100;
    await handler(eventsRequest);
    nowMs = 200;
    const blocked = await handler(stateRequest);

    expect(blocked.isError).toBe(true);
    expect(blocked.structuredContent).toEqual({
      ok: false,
      serverTime,
      error: {
        code: 'rate_limited',
        message: 'Read tools are limited to 2 calls per second.',
        retryable: true,
      },
    });
    expect(client.query).toHaveBeenCalledTimes(2);

    nowMs = 1200;
    const allowed = await handler(stateRequest);
    expect(allowed.isError).toBeUndefined();
  });

  it('dispatches match.vote to matchVote mutation', async () => {
    const client = createClient();
    client.mutation.mockResolvedValue({
      matchId: 'match-2',
      eventId: '12',
      vote: {
        voterPlayerId: 'p:1',
        targetPlayerId: 'p:2',
      },
    });

    const handler = createWerewolfToolHandler({
      client,
      playerId: 'p:1',
      getServerTime: () => serverTime,
    });

    const response = await handler({
      params: {
        name: 'et.werewolf.match.vote',
        arguments: {
          matchId: 'match-2',
          targetPlayerId: 'p:2',
          reason: 'Seems suspicious',
          idempotencyKey: 'vote-key-456',
        },
      },
    });

    expect(client.mutation).toHaveBeenCalledTimes(1);
    const [fn, args] = client.mutation.mock.calls[0] as [unknown, ToolArgs];
    expect(getFunctionName(fn as any)).toBe('werewolf:matchVote');
    expect(args).toEqual({
      matchId: 'match-2',
      targetPlayerId: 'p:2',
      reason: 'Seems suspicious',
      idempotencyKey: 'vote-key-456',
      playerId: 'p:1',
    });
    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toBe('ok');
    expect(response.structuredContent).toEqual({
      ok: true,
      serverTime,
      matchId: 'match-2',
      eventId: '12',
      vote: {
        voterPlayerId: 'p:1',
        targetPlayerId: 'p:2',
      },
      error: null,
    });
  });

  it('validates queue.join output against the MCP schema', async () => {
    const client = createClient();
    client.mutation.mockResolvedValue({
      queue: {
        queueId: 'werewolf-default',
        position: 1,
        size: 1,
        requiredPlayers: 8,
        status: 'WAITING',
        estimatedStartSeconds: 0,
      },
      matchAssignment: null,
    });

    const handler = createWerewolfToolHandler({
      client,
      playerId: 'p:1',
      getServerTime: () => serverTime,
    });

    const response = await handler({
      params: {
        name: 'et.werewolf.queue.join',
        arguments: {
          queueId: 'werewolf-default',
          preferredDisplayName: 'Ralph',
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toBeDefined();
    validateToolOutput('et.werewolf.queue.join', response.structuredContent);
  });

  it('validates queue.status output against the MCP schema', async () => {
    const client = createClient();
    client.query.mockResolvedValue({
      queue: {
        queueId: 'werewolf-default',
        position: 2,
        size: 5,
        requiredPlayers: 8,
        status: 'WAITING',
        estimatedStartSeconds: 45,
      },
      matchAssignment: {
        matchId: 'match-42',
        buildingInstanceId: 'building-42',
        seat: 2,
      },
    });

    const handler = createWerewolfToolHandler({
      client,
      playerId: 'p:1',
      getServerTime: () => serverTime,
    });

    const response = await handler({
      params: {
        name: 'et.werewolf.queue.status',
        arguments: {
          queueId: 'werewolf-default',
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toBeDefined();
    validateToolOutput('et.werewolf.queue.status', response.structuredContent);
  });

  it('validates queue.leave output against the MCP schema', async () => {
    const client = createClient();
    client.mutation.mockResolvedValue({
      removed: true,
      queue: {
        queueId: 'werewolf-default',
        size: 7,
        requiredPlayers: 8,
      },
    });

    const handler = createWerewolfToolHandler({
      client,
      playerId: 'p:1',
      getServerTime: () => serverTime,
    });

    const response = await handler({
      params: {
        name: 'et.werewolf.queue.leave',
        arguments: {
          queueId: 'werewolf-default',
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toBeDefined();
    validateToolOutput('et.werewolf.queue.leave', response.structuredContent);
  });

  it('validates match.get_state output against the MCP schema', async () => {
    const client = createClient();
    client.query.mockResolvedValue({
      state: {
        matchId: 'match-1',
        phase: 'DAY_VOTE',
        dayNumber: 2,
        phaseEndsAt: '2024-01-01T00:10:00.000Z',
        players: [
          {
            playerId: 'p:1',
            displayName: 'Ralph',
            seat: 1,
            alive: true,
            revealedRole: null,
          },
          {
            playerId: 'p:2',
            displayName: 'Nova',
            seat: 2,
            alive: false,
            revealedRole: 'WEREWOLF',
          },
        ],
        publicSummary: 'Night 2 ended. One player fell.',
        recentPublicMessages: [
          {
            eventId: '7',
            at: '2024-01-01T00:09:00.000Z',
            playerId: 'p:1',
            text: 'I think we should vote now.',
          },
        ],
        you: {
          playerId: 'p:1',
          role: 'VILLAGER',
          alive: true,
          knownWolves: [],
          seerHistory: [],
          requiredAction: {
            type: 'VOTE',
            allowedTargets: ['p:2'],
            alreadySubmitted: false,
          },
        },
      },
    });

    const handler = createWerewolfToolHandler({
      client,
      playerId: 'p:1',
      getServerTime: () => serverTime,
    });

    const response = await handler({
      params: {
        name: 'et.werewolf.match.get_state',
        arguments: {
          matchId: 'match-1',
          includeTranscriptSummary: true,
          includeRecentPublicMessages: true,
          recentPublicMessagesLimit: 5,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toBeDefined();
    validateToolOutput('et.werewolf.match.get_state', response.structuredContent);
  });

  it('validates match.events.get output against the MCP schema', async () => {
    const client = createClient();
    client.query.mockResolvedValue({
      matchId: 'match-1',
      events: [
        {
          eventId: '12',
          at: '2024-01-01T00:05:00.000Z',
          visibility: 'PUBLIC',
          type: 'PHASE_CHANGED',
          payload: {
            from: 'DAY_DISCUSSION',
            to: 'DAY_VOTE',
          },
        },
      ],
    });

    const handler = createWerewolfToolHandler({
      client,
      playerId: null,
      getServerTime: () => serverTime,
    });

    const response = await handler({
      params: {
        name: 'et.werewolf.match.events.get',
        arguments: {
          matchId: 'match-1',
          afterEventId: null,
          limit: 10,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toBeDefined();
    validateToolOutput('et.werewolf.match.events.get', response.structuredContent);
  });
});
