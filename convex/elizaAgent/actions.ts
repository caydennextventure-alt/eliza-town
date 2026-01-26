import { action } from '../_generated/server';
import type { ActionCtx } from '../_generated/server';
import { v } from 'convex/values';
import { anyApi } from 'convex/server';
import { Id } from '../_generated/dataModel';

const normalizeElizaServerUrl = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const withoutTrailing = trimmed.replace(/\/+$/, '');
  try {
    const url = new URL(withoutTrailing);
    let path = url.pathname.replace(/\/+$/, '');
    if (path.endsWith('/api/agents')) {
      path = path.slice(0, -'/api/agents'.length);
    } else if (path.endsWith('/api')) {
      path = path.slice(0, -'/api'.length);
    }
    url.pathname = path || '/';
    return url.toString().replace(/\/$/, '');
  } catch {
    return withoutTrailing;
  }
};

const normalizeAuthToken = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const resolveElizaAuthToken = (value?: string) =>
  normalizeAuthToken(value) ?? normalizeAuthToken(process.env.ELIZA_SERVER_AUTH_TOKEN);

const buildElizaHeaders = (authToken?: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['X-API-KEY'] = authToken;
  }
  return headers;
};

const DEFAULT_ELIZA_SERVER =
  normalizeElizaServerUrl(process.env.ELIZA_SERVER_URL) ||
  'https://fliza-agent-production.up.railway.app';
const DEFAULT_ELIZA_WORLD_NAME =
  process.env.ELIZA_WORLD_NAME?.trim() || 'Eliza Town';
const ELIZA_INSTALLATION_KEY = 'default';
// Avoid deep type instantiation in Convex tsc.
const apiAny = anyApi;

const SESSION_EXPIRY_BUFFER_MS = 30_000;

const buildElizaWorldName = (agentName?: string) =>
  agentName ? `${DEFAULT_ELIZA_WORLD_NAME} - ${agentName}` : DEFAULT_ELIZA_WORLD_NAME;

const shouldLogElizaApi = () =>
  /^(1|true|yes)$/i.test(process.env.ELIZA_API_DEBUG ?? '') ||
  /^(1|true|yes)$/i.test(process.env.E2E_ELIZA_DEBUG ?? '');

const shouldSkipLegacy = () =>
  /^(1|true|yes)$/i.test(process.env.ELIZA_DISABLE_LEGACY ?? '') ||
  /^(1|true|yes)$/i.test(process.env.ELIZA_MESSAGING_ONLY ?? '');

const summarizeForLog = (value: string, limit = 200) => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, limit)}...`;
};

const redactHeaders = (headers: Record<string, string>) => {
  const next = { ...headers };
  if (next['X-API-KEY']) {
    next['X-API-KEY'] = '<redacted>';
  }
  return next;
};

const buildCurl = (url: string, headers: Record<string, string>, body: unknown) => {
  const headerFlags = Object.entries(headers).map(([key, value]) => `-H '${key}: ${value}'`);
  const payload = JSON.stringify(body).replace(/'/g, `'\\''`);
  return `curl -s -X POST '${url}' ${headerFlags.join(' ')} -d '${payload}'`;
};

const logElizaRequest = (label: string, url: string, headers: Record<string, string>, body: any) => {
  if (!shouldLogElizaApi()) {
    return;
  }
  console.log(`[ELIZA_API_DEBUG] ${label} request`, {
    url,
    headers: redactHeaders(headers),
    body,
  });
  console.log(`[ELIZA_API_DEBUG] ${label} curl`, buildCurl(url, redactHeaders(headers), body));
};

const logElizaResponse = (label: string, status: number, bodyText?: string) => {
  if (!shouldLogElizaApi()) {
    return;
  }
  console.log(`[ELIZA_API_DEBUG] ${label} response`, {
    status,
    body: bodyText ? summarizeForLog(bodyText, 500) : undefined,
  });
};

const createAbortError = (message: string) => {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
};

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError';

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs?: number) => {
  if (timeoutMs === undefined) {
    return fetch(url, options);
  }
  if (timeoutMs <= 0) {
    throw createAbortError('Request timed out');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const createUuid = () => {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
};

const getOrCreateElizaOwnerId = async (ctx: any) => {
  const existing = await ctx.runQuery(apiAny.elizaAgent.queries.getInstallation, {
    key: ELIZA_INSTALLATION_KEY,
  });
  if (existing?.userId) {
    return existing.userId;
  }
  const candidate = createUuid();
  const created = await ctx.runMutation(apiAny.elizaAgent.mutations.saveInstallation, {
    key: ELIZA_INSTALLATION_KEY,
    userId: candidate,
  });
  return created.userId;
};

const createElizaWorld = async (params: {
  elizaAgentId: string;
  elizaServerUrl: string;
  authToken?: string;
  worldName: string;
  timeoutMs?: number;
}) => {
  const url = `${params.elizaServerUrl}/api/agents/${params.elizaAgentId}/worlds`;
  const headers = buildElizaHeaders(params.authToken);
  const payload = { name: params.worldName };
  logElizaRequest('world', url, headers, payload);
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
    params.timeoutMs,
  );
  const text = await res.text();
  if (!res.ok) {
    logElizaResponse('world', res.status, text);
    throw new Error(`Eliza world create error (${res.status}): ${text}`);
  }
  logElizaResponse('world', res.status, text);
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Eliza world create invalid JSON: ${summarizeForLog(text, 200)}`);
  }
  const worldId =
    data.worldId ??
    data.id ??
    data.world?.id ??
    data.data?.world?.id ??
    data.data?.id;
  if (!worldId) {
    throw new Error('Eliza world create missing worldId');
  }
  return worldId;
};

const updateElizaWorldOwnership = async (params: {
  elizaAgentId: string;
  elizaServerUrl: string;
  authToken?: string;
  worldId: string;
  ownerId: string;
  timeoutMs?: number;
}) => {
  const url = `${params.elizaServerUrl}/api/agents/${params.elizaAgentId}/worlds/${params.worldId}`;
  const headers = buildElizaHeaders(params.authToken);
  const payload = {
    metadata: {
      ownership: { ownerId: params.ownerId },
      roles: { [params.ownerId]: 'OWNER' },
    },
  };
  logElizaRequest('world-update', url, headers, payload);
  const res = await fetchWithTimeout(
    url,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    },
    params.timeoutMs,
  );
  const text = await res.text();
  if (!res.ok) {
    logElizaResponse('world-update', res.status, text);
    throw new Error(`Eliza world update error (${res.status}): ${text}`);
  }
  logElizaResponse('world-update', res.status, text);
};

const ensureElizaWorld = async (params: {
  ctx: any;
  elizaAgentId: string;
  elizaServerUrl: string;
  authToken?: string;
  timeoutMs?: number;
  agentName?: string;
}) => {
  const userId = await getOrCreateElizaOwnerId(params.ctx);
  const mapping = await params.ctx.runQuery(apiAny.elizaAgent.queries.getByElizaAgentId, {
    elizaAgentId: params.elizaAgentId,
  });
  if (!mapping) {
    return { userId, worldId: undefined };
  }

  let worldId: string | undefined = mapping.elizaWorldId;
  let needsOwnership =
    !worldId || !mapping.elizaUserId || mapping.elizaUserId !== userId;

  if (!worldId) {
    const worldName = buildElizaWorldName(mapping.name || params.agentName);
    try {
      worldId = await createElizaWorld({
        elizaAgentId: params.elizaAgentId,
        elizaServerUrl: params.elizaServerUrl,
        authToken: params.authToken,
        worldName,
        timeoutMs: params.timeoutMs,
      });
      needsOwnership = true;
    } catch (error) {
      console.error('Eliza world create failed', error);
    }
  }

  if (worldId && needsOwnership) {
    try {
      await updateElizaWorldOwnership({
        elizaAgentId: params.elizaAgentId,
        elizaServerUrl: params.elizaServerUrl,
        authToken: params.authToken,
        worldId,
        ownerId: userId,
        timeoutMs: params.timeoutMs,
      });
    } catch (error) {
      console.error('Eliza world ownership update failed', error);
    }
  }

  if (
    mapping.elizaWorldId !== worldId ||
    mapping.elizaUserId !== userId
  ) {
    await params.ctx.runMutation(apiAny.elizaAgent.mutations.updateElizaIdentity, {
      elizaAgentId: params.elizaAgentId,
      elizaWorldId: worldId,
      elizaUserId: userId,
    });
  }

  return { userId, worldId };
};

const isLikelyNotFound = (status: number, bodyText: string) => {
  if (status === 404) {
    return true;
  }
  return bodyText.toLowerCase().includes('endpoint not found');
};

const parseLegacyResponseText = (data: any): string | null => {
  if (Array.isArray(data) && data.length > 0 && typeof data[0]?.text === 'string') {
    return data[0].text;
  }
  if (typeof data?.text === 'string') {
    return data.text;
  }
  if (typeof data?.content?.text === 'string') {
    return data.content.text;
  }
  if (typeof data?.content === 'string') {
    return data.content;
  }
  return null;
};

const parseSseStream = async (res: Response): Promise<{ text: string | null; error?: string }> => {
  const reader = res.body?.getReader();
  if (!reader) {
    return { text: null };
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let dataLines: string[] = [];
  let collectedText = '';
  let finalText: string | null = null;
  let errorMessage: string | undefined;

  const flushEvent = () => {
    if (!eventName && dataLines.length === 0) {
      return;
    }
    const dataRaw = dataLines.join('\n');
    let parsed: any = null;
    if (dataRaw) {
      try {
        parsed = JSON.parse(dataRaw);
      } catch {
        parsed = null;
      }
    }
    if (eventName === 'chunk') {
      const chunk = parsed?.chunk ?? parsed?.text ?? parsed?.content;
      if (typeof chunk === 'string') {
        collectedText += chunk;
      }
    } else if (eventName === 'done' || eventName === 'complete') {
      const text =
        parsed?.text ?? parsed?.message?.text ?? parsed?.message?.content ?? parsed?.content;
      if (typeof text === 'string') {
        finalText = text;
      }
    } else if (eventName === 'message' || eventName === 'agent_message') {
      const text = parsed?.text ?? parsed?.content;
      if (typeof text === 'string') {
        finalText = text;
      }
    } else if (eventName === 'error') {
      const errorText = parsed?.error ?? parsed?.message ?? dataRaw;
      if (typeof errorText === 'string') {
        errorMessage = errorText;
      }
    } else if (!eventName && typeof parsed?.text === 'string' && !finalText) {
      finalText = parsed.text;
    }
    eventName = '';
    dataLines = [];
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      } else if (line.trim() === '') {
        flushEvent();
      }
    }
  }
  flushEvent();

  return {
    text: finalText ?? (collectedText ? collectedText : null),
    error: errorMessage,
  };
};

const createMessagingSession = async (params: {
  ctx: any;
  elizaAgentId: string;
  elizaServerUrl: string;
  authToken?: string;
  conversationId: string;
  userId?: string;
  timeoutMs?: number;
}) => {
  const userId = params.userId ?? createUuid();
  const url = `${params.elizaServerUrl}/api/messaging/sessions`;
  const headers = buildElizaHeaders(params.authToken);
  const payload = {
    agentId: params.elizaAgentId,
    userId,
    metadata: { conversationId: params.conversationId },
  };
  logElizaRequest('session', url, headers, payload);
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
    params.timeoutMs,
  );
  const text = await res.text();
  if (!res.ok) {
    logElizaResponse('session', res.status, text);
    throw new Error(`Eliza messaging session error (${res.status}): ${text}`);
  }
  logElizaResponse('session', res.status, text);
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Eliza messaging session invalid JSON: ${summarizeForLog(text, 200)}`);
  }
  const sessionId = data.sessionId ?? data.id;
  if (!sessionId) {
    throw new Error('Eliza messaging session missing sessionId');
  }
  const expiresAtMs = data.expiresAt ? Date.parse(data.expiresAt) : undefined;
  const session = {
    sessionId,
    userId,
    channelId: data.channelId,
    expiresAt: Number.isNaN(expiresAtMs ?? NaN) ? undefined : expiresAtMs,
  };
  await params.ctx.runMutation(apiAny.elizaAgent.mutations.saveSession, {
    elizaAgentId: params.elizaAgentId,
    conversationId: params.conversationId,
    sessionId: session.sessionId,
    userId: session.userId,
    channelId: session.channelId,
    elizaServerUrl: params.elizaServerUrl,
    expiresAt: session.expiresAt,
    lastUsedAt: Date.now(),
  });
  return session;
};

const getOrCreateSession = async (params: {
  ctx: any;
  elizaAgentId: string;
  elizaServerUrl: string;
  authToken?: string;
  conversationId: string;
  userId?: string;
  timeoutMs?: number;
}) => {
  const existing = await params.ctx.runQuery(
    apiAny.elizaAgent.queries.getSessionByConversation,
    {
      elizaAgentId: params.elizaAgentId,
      conversationId: params.conversationId,
    },
  );
  const now = Date.now();
  if (
    existing &&
    (existing.expiresAt === undefined || existing.expiresAt > now + SESSION_EXPIRY_BUFFER_MS)
  ) {
    if (params.userId && existing.userId !== params.userId) {
      if (shouldLogElizaApi()) {
        console.log('[ELIZA_API_DEBUG] session user mismatch, recreating', {
          elizaAgentId: params.elizaAgentId,
          sessionId: existing.sessionId,
          existingUserId: existing.userId,
          desiredUserId: params.userId,
        });
      }
    } else {
      if (shouldLogElizaApi()) {
        console.log('[ELIZA_API_DEBUG] session reuse', {
          elizaAgentId: params.elizaAgentId,
          sessionId: existing.sessionId,
          expiresAt: existing.expiresAt,
        });
      }
      return {
        sessionId: existing.sessionId,
        userId: existing.userId,
        channelId: existing.channelId,
        expiresAt: existing.expiresAt,
      };
    }
  }
  return await createMessagingSession(params);
};

const sendMessageWithSession = async (params: {
  elizaServerUrl: string;
  authToken?: string;
  sessionId: string;
  message: string;
  senderId: string;
  conversationId: string;
  timeoutMs?: number;
}) => {
  const messageSummary = summarizeForLog(params.message);
  const messageLength = params.message.length;
  const payload = {
    content: messageSummary,
    mode: 'stream',
    metadata: {
      senderId: params.senderId,
      conversationId: params.conversationId,
      messageLength,
    },
  };
  const headers = {
    ...buildElizaHeaders(params.authToken),
    Accept: 'text/event-stream',
  };
  logElizaRequest(
    'messaging',
    `${params.elizaServerUrl}/api/messaging/sessions/${params.sessionId}/messages`,
    headers,
    payload,
  );
  const res = await fetchWithTimeout(
    `${params.elizaServerUrl}/api/messaging/sessions/${params.sessionId}/messages`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: params.message,
        mode: 'stream',
        metadata: {
          senderId: params.senderId,
          conversationId: params.conversationId,
        },
      }),
    },
    params.timeoutMs,
  );
  if (!res.ok) {
    const text = await res.text();
    logElizaResponse('messaging', res.status, text);
    return { ok: false as const, status: res.status, body: text };
  }
  const { text, error } = await parseSseStream(res);
  if (error) {
    logElizaResponse('messaging', 200, error);
    return { ok: false as const, status: 200, body: error };
  }
  logElizaResponse('messaging', 200, text ?? '');
  return { ok: true as const, text };
};

export const createElizaAgent = action({
  args: {
    worldId: v.id('worlds'),
    name: v.string(),
    character: v.string(),
    identity: v.string(), // Maps to bio
    plan: v.string(),
    personality: v.array(v.string()), // ['Friendly', 'Curious']
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ inputId: Id<"inputs"> | string; elizaAgentId: string }> => {
    // 1. Create in ElizaOS
    const elizaServerUrlOverride = normalizeElizaServerUrl(args.elizaServerUrl);
    const elizaServerUrl = elizaServerUrlOverride ?? DEFAULT_ELIZA_SERVER;
    const authToken = resolveElizaAuthToken(args.elizaAuthToken);
    const storedAuthToken = normalizeAuthToken(args.elizaAuthToken);
    console.log(`Creating Eliza Agent [${args.name}] at ${elizaServerUrl}...`);
    
    try {
      // Create character JSON object (minimal required fields)
      const characterConfig = {
          name: args.name,
          bio: [args.identity],
          adjectives: args.personality,
          system: `You are ${args.name}. Your plan is to ${args.plan}.`,
      };

      console.log('Sending JSON request to ElizaOS...');

      const res = await fetch(`${elizaServerUrl}/api/agents`, {
        method: 'POST',
        headers: buildElizaHeaders(authToken),
        body: JSON.stringify({ characterJson: characterConfig }),
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElizaOS error (${res.status}): ${text}`);
      }
      
      const data = await res.json();
      let elizaAgentId = data.id || data.data?.id; 
      
      if (!elizaAgentId && data.success && data.data) {
         elizaAgentId = data.data.id;
      }
      
      // If still finding it... sometimes it's an array?
      if (!elizaAgentId && Array.isArray(data)) {
        elizaAgentId = data[0]?.id;
      }
      
      if (!elizaAgentId) {
          console.error("ElizaOS Response:", data);
          throw new Error("Failed to parse Eliza Agent ID from response");
      }
      
      console.log(`Eliza Agent created: ${elizaAgentId}`);

      // 2. Create game player using existing API
      // We use api.world.createAgent to create the character in the game engine
      // casting to any to avoid circular type inference issues
      const inputId: any = await ctx.runMutation(apiAny.world.createAgent, {
         worldId: args.worldId,
         name: args.name,
         character: args.character,
         identity: args.identity,
         plan: args.plan,
      });
      
      // 3. Save Mapping
      // We can't link playerId yet as it's created asynchronously by the engine.
      // We map by name/worldId for now, or just store the record.
      await ctx.runMutation(apiAny.elizaAgent.mutations.saveMapping, {
         worldId: args.worldId,
         name: args.name, 
         elizaAgentId,
         bio: args.identity,
         personality: args.personality,
         elizaServerUrl: elizaServerUrlOverride,
         elizaAuthToken: storedAuthToken,
         // playerId Left undefined for now, to be linked later if needed
      });

      try {
        await ensureElizaWorld({
          ctx,
          elizaAgentId,
          elizaServerUrl,
          authToken,
          agentName: args.name,
        });
      } catch (error) {
        console.error('Eliza world initialization failed', error);
      }
      
      return { inputId, elizaAgentId };
    } catch (e: any) {
        console.error("Create Eliza Agent Failed", e);
        throw new Error("Failed to create Eliza Agent: " + e.message);
    }
  },
});

type SendMessageArgs = {
  elizaAgentId: string;
  elizaServerUrl?: string;
  elizaAuthToken?: string;
  message: string;
  senderId: string;
  conversationId: string;
  timeoutMs?: number;
};

export const sendElizaMessage = async (
  ctx: ActionCtx,
  args: SendMessageArgs,
): Promise<string | null> => {
  const elizaServerUrl = normalizeElizaServerUrl(args.elizaServerUrl) ?? DEFAULT_ELIZA_SERVER;
  const authToken = resolveElizaAuthToken(args.elizaAuthToken);
  const deadline = typeof args.timeoutMs === 'number' ? Date.now() + args.timeoutMs : undefined;
  const remainingMs = () => (deadline === undefined ? undefined : Math.max(0, deadline - Date.now()));
  let legacyStatus = 0;
  let legacyBody = '';
  const skipLegacy = shouldSkipLegacy();

  try {
    let elizaUserId = args.senderId;
    try {
      const ensured = await ensureElizaWorld({
        ctx,
        elizaAgentId: args.elizaAgentId,
        elizaServerUrl,
        authToken,
        timeoutMs: remainingMs(),
      });
      elizaUserId = ensured.userId;
    } catch (error) {
      console.error('Eliza world ensure failed', error);
    }

    if (!skipLegacy) {
      const messageSummary = summarizeForLog(args.message);
      const messageLength = args.message.length;
      const legacyPayload = {
        entityId: elizaUserId,
        roomId: args.conversationId,
        content: { text: messageSummary, source: 'api' },
        text: messageSummary,
        userId: elizaUserId,
        messageLength,
      };
      logElizaRequest(
        'legacy',
        `${elizaServerUrl}/api/agents/${args.elizaAgentId}/message`,
        buildElizaHeaders(authToken),
        legacyPayload,
      );
      const legacyRes = await fetchWithTimeout(
        `${elizaServerUrl}/api/agents/${args.elizaAgentId}/message`,
        {
          method: 'POST',
          headers: buildElizaHeaders(authToken),
          body: JSON.stringify({
            entityId: elizaUserId,
            roomId: args.conversationId,
            content: { text: args.message, source: 'api' },
            text: args.message,
            userId: elizaUserId,
          }),
        },
        remainingMs(),
      );

      legacyStatus = legacyRes.status;
      if (legacyRes.ok) {
        const data = await legacyRes.json();
        return parseLegacyResponseText(data);
      }

      legacyBody = await legacyRes.text();
      logElizaResponse('legacy', legacyStatus, legacyBody);
    } else if (shouldLogElizaApi()) {
      console.log('[ELIZA_API_DEBUG] legacy skipped', { reason: 'ELIZA_DISABLE_LEGACY' });
    }

    const session = await getOrCreateSession({
      ctx,
      elizaAgentId: args.elizaAgentId,
      elizaServerUrl,
      authToken,
      conversationId: args.conversationId,
      userId: elizaUserId,
      timeoutMs: remainingMs(),
    });
    const firstAttempt = await sendMessageWithSession({
      elizaServerUrl,
      authToken,
      message: args.message,
      senderId: args.senderId,
      conversationId: args.conversationId,
      sessionId: session.sessionId,
      timeoutMs: remainingMs(),
    });
    if (!firstAttempt.ok) {
      if (firstAttempt.status === 404 || firstAttempt.status === 410) {
        const refreshed = await createMessagingSession({
          ctx,
          elizaAgentId: args.elizaAgentId,
          elizaServerUrl,
          authToken,
          conversationId: args.conversationId,
          userId: elizaUserId,
          timeoutMs: remainingMs(),
        });
        const retry = await sendMessageWithSession({
          elizaServerUrl,
          authToken,
          message: args.message,
          senderId: args.senderId,
          conversationId: args.conversationId,
          sessionId: refreshed.sessionId,
          timeoutMs: remainingMs(),
        });
        if (!retry.ok) {
          console.error('Eliza Chat Error', {
            legacyStatus,
            legacyBody,
            sessionError: retry.body,
          });
          return null;
        }
        await ctx.runMutation(apiAny.elizaAgent.mutations.saveSession, {
          elizaAgentId: args.elizaAgentId,
          conversationId: args.conversationId,
          sessionId: refreshed.sessionId,
          userId: refreshed.userId,
          channelId: refreshed.channelId,
          elizaServerUrl,
          expiresAt: refreshed.expiresAt,
          lastUsedAt: Date.now(),
        });
        return retry.text;
      }
      console.error('Eliza Chat Error', {
        legacyStatus,
        legacyBody,
        sessionError: firstAttempt.body,
      });
      return null;
    }
    await ctx.runMutation(apiAny.elizaAgent.mutations.saveSession, {
      elizaAgentId: args.elizaAgentId,
      conversationId: args.conversationId,
      sessionId: session.sessionId,
      userId: session.userId,
      channelId: session.channelId,
      elizaServerUrl,
      expiresAt: session.expiresAt,
      lastUsedAt: Date.now(),
    });
    return firstAttempt.text;
  } catch (error: any) {
    if (isAbortError(error)) {
      return null;
    }
    console.error('Eliza Chat Error', {
      legacyStatus,
      legacyBody,
      sessionError: error?.message ?? error,
    });
    return null;
  }
};

export const sendMessage = action({
  args: {
    elizaAgentId: v.string(),
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
    message: v.string(),
    senderId: v.string(),
    conversationId: v.string(),
    timeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => await sendElizaMessage(ctx, args),
});
