import { anyApi } from 'convex/server';
import { ConvexError } from 'convex/values';

type ToolArgs = Record<string, unknown>;

const werewolfApi = anyApi.werewolf as any;

type ConvexClient = {
  query: (fn: any, args?: any) => Promise<any>;
  mutation: (fn: any, args?: any) => Promise<any>;
};

type ToolCallRequest = {
  params: {
    name: string;
    arguments?: ToolArgs;
  };
};

type ToolCallResponse = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type ToolError = {
  code: string;
  message: string;
  retryable: boolean;
};

const READ_TOOL_NAMES = new Set([
  'et.werewolf.match.get_state',
  'et.werewolf.match.events.get',
]);
const READ_TOOL_MAX_CALLS = 2;
const READ_TOOL_WINDOW_MS = 1_000;
const READ_TOOL_RATE_LIMIT_MESSAGE = 'Read tools are limited to 2 calls per second.';

class ToolRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

type HandlerContext = {
  client: ConvexClient;
  playerId: string | null;
  getServerTime: () => string;
};

type ToolHandler = (args: ToolArgs, ctx: HandlerContext) => Promise<Record<string, unknown>>;

const buildSuccessResponse = (
  payload: Record<string, unknown>,
  serverTime: string,
): ToolCallResponse => ({
  content: [{ type: 'text', text: 'ok' }],
  structuredContent: {
    ok: true,
    serverTime,
    ...payload,
    error: null,
  },
});

const buildErrorResponse = (error: ToolError, serverTime: string): ToolCallResponse => ({
  content: [{ type: 'text', text: error.message }],
  structuredContent: {
    ok: false,
    serverTime,
    error,
  },
  isError: true,
});

const requirePlayerId = (playerId: string | null): string => {
  if (!playerId) {
    throw new ToolRequestError(
      'missing_player_id',
      'ET_PLAYER_ID is required for this tool.',
      false,
    );
  }
  return playerId;
};

const isRetryableError = (error: unknown): boolean => error instanceof TypeError;

const toToolError = (error: unknown): ToolError => {
  if (error instanceof ToolRequestError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof ConvexError) {
    return { code: 'convex_error', message: error.message, retryable: false };
  }
  if (error instanceof Error) {
    return {
      code: 'internal_error',
      message: error.message || 'Unknown error',
      retryable: isRetryableError(error),
    };
  }
  return { code: 'internal_error', message: 'Unknown error', retryable: false };
};

type RateLimiter = {
  assertAllowed: () => void;
};

const createRateLimiter = (options: {
  maxCalls: number;
  windowMs: number;
  getNow: () => number;
}): RateLimiter => {
  const calls: number[] = [];
  return {
    assertAllowed: () => {
      const now = options.getNow();
      while (calls.length > 0 && now - calls[0] >= options.windowMs) {
        calls.shift();
      }
      if (calls.length >= options.maxCalls) {
        throw new ToolRequestError('rate_limited', READ_TOOL_RATE_LIMIT_MESSAGE, true);
      }
      calls.push(now);
    },
  };
};

const toolHandlers: Record<string, ToolHandler> = {
  'et.werewolf.queue.join': async (args, ctx) => {
    const result = await ctx.client.mutation(werewolfApi.queueJoin, {
      ...args,
      playerId: requirePlayerId(ctx.playerId),
    });
    return result as Record<string, unknown>;
  },
  'et.werewolf.queue.leave': async (args, ctx) => {
    const result = await ctx.client.mutation(werewolfApi.queueLeave, {
      ...args,
      playerId: requirePlayerId(ctx.playerId),
    });
    return result as Record<string, unknown>;
  },
  'et.werewolf.queue.status': async (args, ctx) => {
    const result = await ctx.client.query(werewolfApi.queueStatus, {
      ...args,
      playerId: requirePlayerId(ctx.playerId),
    });
    return result as Record<string, unknown>;
  },
  'et.werewolf.matches.list': async (args, ctx) => {
    return (await ctx.client.query(werewolfApi.matchesList, args)) as Record<string, unknown>;
  },
  'et.werewolf.match.get_state': async (args, ctx) => {
    const payload: ToolArgs = { ...args };
    if (ctx.playerId) {
      payload.playerId = ctx.playerId;
    }
    return (await ctx.client.query(werewolfApi.matchGetState, payload)) as Record<string, unknown>;
  },
  'et.werewolf.match.events.get': async (args, ctx) => {
    const payload: ToolArgs = { ...args };
    if (ctx.playerId) {
      payload.playerId = ctx.playerId;
    }
    return (await ctx.client.query(werewolfApi.matchEventsGet, payload)) as Record<string, unknown>;
  },
  'et.werewolf.match.ready': async (args, ctx) => {
    return (await ctx.client.mutation(werewolfApi.matchReady, {
      ...args,
      playerId: requirePlayerId(ctx.playerId),
    })) as Record<string, unknown>;
  },
  'et.werewolf.match.say_public': async (args, ctx) => {
    return (await ctx.client.mutation(werewolfApi.matchSayPublic, {
      ...args,
      playerId: requirePlayerId(ctx.playerId),
    })) as Record<string, unknown>;
  },
  'et.werewolf.match.vote': async (args, ctx) => {
    return (await ctx.client.mutation(werewolfApi.matchVote, {
      ...args,
      playerId: requirePlayerId(ctx.playerId),
    })) as Record<string, unknown>;
  },
  'et.werewolf.match.night.wolf_chat': async (args, ctx) => {
    return (await ctx.client.mutation(werewolfApi.matchWolfChat, {
      ...args,
      playerId: requirePlayerId(ctx.playerId),
    })) as Record<string, unknown>;
  },
  'et.werewolf.match.night.wolf_kill': async (args, ctx) => {
    return (await ctx.client.mutation(werewolfApi.matchWolfKill, {
      ...args,
      playerId: requirePlayerId(ctx.playerId),
    })) as Record<string, unknown>;
  },
  'et.werewolf.match.night.seer_inspect': async (args, ctx) => {
    return (await ctx.client.mutation(werewolfApi.matchSeerInspect, {
      ...args,
      playerId: requirePlayerId(ctx.playerId),
    })) as Record<string, unknown>;
  },
  'et.werewolf.match.night.doctor_protect': async (args, ctx) => {
    return (await ctx.client.mutation(werewolfApi.matchDoctorProtect, {
      ...args,
      playerId: requirePlayerId(ctx.playerId),
    })) as Record<string, unknown>;
  },
};

export const createWerewolfToolHandler = (options: {
  client: ConvexClient;
  playerId?: string | null;
  getServerTime?: () => string;
  getNow?: () => number;
}): ((request: ToolCallRequest) => Promise<ToolCallResponse>) => {
  const getNow = options.getNow ?? (() => Date.now());
  const readRateLimiter = createRateLimiter({
    maxCalls: READ_TOOL_MAX_CALLS,
    windowMs: READ_TOOL_WINDOW_MS,
    getNow,
  });
  const ctx: HandlerContext = {
    client: options.client,
    playerId: options.playerId ?? null,
    getServerTime: options.getServerTime ?? (() => new Date().toISOString()),
  };

  return async (request: ToolCallRequest): Promise<ToolCallResponse> => {
    const handler = toolHandlers[request.params.name];
    const serverTime = ctx.getServerTime();

    if (!handler) {
      return buildErrorResponse(
        { code: 'unknown_tool', message: `Unknown tool: ${request.params.name}`, retryable: false },
        serverTime,
      );
    }

    try {
      if (READ_TOOL_NAMES.has(request.params.name)) {
        readRateLimiter.assertAllowed();
      }
      const args = request.params.arguments ?? {};
      const payload = await handler(args, ctx);
      return buildSuccessResponse(payload, serverTime);
    } catch (error) {
      return buildErrorResponse(toToolError(error), serverTime);
    }
  };
};
