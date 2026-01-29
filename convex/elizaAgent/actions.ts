import { action } from '../_generated/server';
import type { ActionCtx } from '../_generated/server';
import { v } from 'convex/values';
import { anyApi } from 'convex/server';
import { Id } from '../_generated/dataModel';
import { sleep } from '../util/sleep';

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

const shouldPollOnly = () =>
  /^(1|true|yes)$/i.test(process.env.ELIZA_POLL_ONLY ?? '');

const summarizeForLog = (value: string, limit = 200) => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, limit)}...`;
};

const truncateBody = (value: string, limit = 1000) => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}...`;
};

const pickString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string');
    return pickString(first);
  }
  return undefined;
};

const pickStringFromKeys = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (key in record) {
      const value = pickString(record[key]);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
};

const normalizeAgentPayload = (payload: unknown): Record<string, unknown> | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (Array.isArray(payload)) {
    const first = payload.find((entry) => entry && typeof entry === 'object');
    return (first as Record<string, unknown>) ?? null;
  }
  const record = payload as Record<string, unknown>;
  if (record.data && typeof record.data === 'object') {
    return record.data as Record<string, unknown>;
  }
  if (record.agent && typeof record.agent === 'object') {
    return record.agent as Record<string, unknown>;
  }
  if (record.result && typeof record.result === 'object') {
    return record.result as Record<string, unknown>;
  }
  return record;
};

type AgentSummary = {
  id?: string;
  name?: string;
  username?: string;
  bio?: string;
  personality?: string[];
  plan?: string;
};

type CommunicationMode = 'legacy' | 'messaging-stream' | 'messaging-poll';

type CommunicationDiagnostics = {
  ok: boolean;
  message?: string;
};

type CommunicationTestMessage = {
  role: 'user' | 'agent';
  text: string;
};

const normalizeCommunicationMode = (value?: string): CommunicationMode | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'legacy') {
    return 'legacy';
  }
  if (normalized === 'messaging-stream' || normalized === 'stream' || normalized === 'streaming') {
    return 'messaging-stream';
  }
  if (normalized === 'messaging-poll' || normalized === 'poll' || normalized === 'queue') {
    return 'messaging-poll';
  }
  return null;
};

const pickStringArray = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const items = value.filter((entry): entry is string => typeof entry === 'string');
    return items.length ? items : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : undefined;
  }
  return undefined;
};

const extractAgentSummary = (payload: unknown): AgentSummary | null => {
  const record = normalizeAgentPayload(payload);
  if (!record) {
    return null;
  }
  const character =
    record.character && typeof record.character === 'object'
      ? (record.character as Record<string, unknown>)
      : null;
  let id =
    pickStringFromKeys(record, ['id', 'agentId', '_id', 'agent_id']) ??
    (character ? pickStringFromKeys(character, ['id', 'agentId']) : undefined);
  const name =
    pickStringFromKeys(record, ['name', 'displayName', 'agentName']) ??
    (character ? pickStringFromKeys(character, ['name', 'displayName']) : undefined);
  const username =
    pickStringFromKeys(record, ['username', 'handle', 'slug']) ??
    (character ? pickStringFromKeys(character, ['username', 'handle', 'slug']) : undefined);
  const bio =
    pickStringFromKeys(record, ['bio', 'description', 'identity']) ??
    (character ? pickStringFromKeys(character, ['bio', 'description', 'identity']) : undefined);
  if (!id && username) {
    id = username;
  }
  const personality =
    pickStringArray(record.adjectives) ??
    pickStringArray(record.personality) ??
    pickStringArray(record.traits) ??
    (character ? pickStringArray(character.adjectives ?? character.personality ?? character.traits) : undefined);
  const plan =
    pickStringFromKeys(record, ['plan', 'goal', 'objective']) ??
    (character ? pickStringFromKeys(character, ['plan', 'goal', 'objective']) : undefined);
  return { id, name, username, bio, personality, plan };
};

const extractAgentList = (payload: unknown): AgentSummary[] => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload.map(extractAgentSummary).filter((entry): entry is AgentSummary => Boolean(entry));
  }
  const record = payload as Record<string, unknown>;
  const dataRecord =
    record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null;
  const container =
    (Array.isArray(record.data) && record.data) ||
    (dataRecord && Array.isArray(dataRecord.agents) && dataRecord.agents) ||
    (dataRecord && Array.isArray(dataRecord.items) && dataRecord.items) ||
    (dataRecord && Array.isArray(dataRecord.results) && dataRecord.results) ||
    (Array.isArray(record.agents) && record.agents) ||
    (Array.isArray(record.items) && record.items) ||
    (Array.isArray(record.results) && record.results) ||
    null;
  if (!container) {
    return [];
  }
  return container
    .map(extractAgentSummary)
    .filter((entry): entry is AgentSummary => Boolean(entry));
};

const redactHeaders = (headers: Record<string, string>) => {
  const next = { ...headers };
  if (next['X-API-KEY']) {
    next['X-API-KEY'] = '<redacted>';
  }
  return next;
};

const safeJsonStringify = (value: unknown) => {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, val) => {
      if (val && typeof val === 'object') {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
      }
      return val;
    });
  } catch (error) {
    return JSON.stringify({ error: (error as Error)?.message ?? 'Unserializable payload' });
  }
};

const buildCurl = (url: string, headers: Record<string, string>, body: unknown) => {
  const headerFlags = Object.entries(headers).map(([key, value]) => `-H '${key}: ${value}'`);
  const payload = safeJsonStringify(body).replace(/'/g, `'\\''`);
  return `curl -s -X POST '${url}' ${headerFlags.join(' ')} -d '${payload}'`;
};

const shouldLogElizaVerbose = () =>
  /^(1|true|yes)$/i.test(process.env.ELIZA_API_DEBUG_VERBOSE ?? '');

const shouldLogElizaCurl = () =>
  /^(1|true|yes)$/i.test(process.env.ELIZA_API_DEBUG_CURL ?? '');

const shouldAllowPollOnlySseFallback = () =>
  /^(1|true|yes)$/i.test(process.env.ELIZA_POLL_ONLY_ALLOW_SSE ?? '');

const logElizaRequest = (label: string, url: string, headers: Record<string, string>, body: any) => {
  if (!shouldLogElizaApi()) {
    return;
  }
  console.log(`[ELIZA_API_DEBUG] ${label} request`, {
    url,
    headers: redactHeaders(headers),
    body,
  });
  if (shouldLogElizaCurl()) {
    console.log(`[ELIZA_API_DEBUG] ${label} curl`, buildCurl(url, redactHeaders(headers), body));
  }
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

const extractTextFromPayload = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractTextFromPayload(item);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  const nestedCandidates = [
    record.text,
    record.content,
    record.message,
    record.response,
    record.reply,
    record.output,
    record.data,
    record.payload,
  ];
  for (const candidate of nestedCandidates) {
    const extracted = extractTextFromPayload(candidate);
    if (extracted) {
      return extracted;
    }
  }
  return null;
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
  const extracted = extractTextFromPayload(data);
  if (extracted) {
    return extracted;
  }
  return null;
};

const sendLegacyMessage = async (params: {
  elizaServerUrl: string;
  authToken?: string;
  elizaAgentId: string;
  message: string;
  userId: string;
  conversationId: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; text: string | null; status: number; body?: string }> => {
  const messageSummary = summarizeForLog(params.message);
  const messageLength = params.message.length;
  const legacyPayload = {
    entityId: params.userId,
    roomId: params.conversationId,
    content: { text: messageSummary, source: 'api' },
    text: messageSummary,
    userId: params.userId,
    messageLength,
  };
  logElizaRequest(
    'legacy',
    `${params.elizaServerUrl}/api/agents/${params.elizaAgentId}/message`,
    buildElizaHeaders(params.authToken),
    legacyPayload,
  );
  const legacyRes = await fetchWithTimeout(
    `${params.elizaServerUrl}/api/agents/${params.elizaAgentId}/message`,
    {
      method: 'POST',
      headers: buildElizaHeaders(params.authToken),
      body: JSON.stringify({
        entityId: params.userId,
        roomId: params.conversationId,
        content: { text: params.message, source: 'api' },
        text: params.message,
        userId: params.userId,
      }),
    },
    params.timeoutMs,
  );
  const status = legacyRes.status;
  if (legacyRes.ok) {
    const data = await legacyRes.json();
    return { ok: true, text: parseLegacyResponseText(data), status };
  }
  const body = await legacyRes.text();
  logElizaResponse('legacy', status, body);
  return { ok: false, text: null, status, body };
};

const parseSsePayload = (payload: string): { text: string | null; error?: string } => {
  let buffer = payload;
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
    const rawText = parsed ? null : dataRaw.trim();
    if (eventName === 'chunk') {
      const chunk =
        extractTextFromPayload(parsed?.chunk) ??
        extractTextFromPayload(parsed?.text) ??
        extractTextFromPayload(parsed?.content) ??
        extractTextFromPayload(parsed?.message);
      if (chunk) {
        collectedText += chunk;
      } else if (rawText) {
        collectedText += rawText;
      }
    } else if (eventName === 'done' || eventName === 'complete') {
      const text =
        extractTextFromPayload(parsed?.text) ??
        extractTextFromPayload(parsed?.message) ??
        extractTextFromPayload(parsed?.content);
      if (text) {
        finalText = text;
      } else if (rawText) {
        finalText = rawText;
      }
    } else if (eventName === 'message' || eventName === 'agent_message') {
      const text =
        extractTextFromPayload(parsed?.text) ??
        extractTextFromPayload(parsed?.content) ??
        extractTextFromPayload(parsed?.message);
      if (text) {
        finalText = text;
      } else if (rawText) {
        finalText = rawText;
      }
    } else if (eventName === 'error') {
      const errorText = parsed?.error ?? parsed?.message ?? dataRaw;
      if (typeof errorText === 'string') {
        errorMessage = errorText;
      }
    } else if (!eventName) {
      if (typeof parsed?.text === 'string' && !finalText) {
        finalText = parsed.text;
      } else if (rawText) {
        collectedText += rawText;
      }
    }
    eventName = '';
    dataLines = [];
  };

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
  if (buffer.length > 0) {
    if (buffer.startsWith('event:')) {
      eventName = buffer.slice(6).trim();
    } else if (buffer.startsWith('data:')) {
      dataLines.push(buffer.slice(5).trim());
    } else if (buffer.trim() === '') {
      flushEvent();
    }
  }
  flushEvent();

  return {
    text: finalText ?? (collectedText ? collectedText : null),
    error: errorMessage,
  };
};

const parseSseStream = async (res: Response): Promise<{ text: string | null; error?: string }> => {
  const reader = res.body?.getReader?.();
  if (!reader) {
    return parseSsePayload(await res.text());
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
    const rawText = parsed ? null : dataRaw.trim();
    if (eventName === 'chunk') {
      const chunk =
        extractTextFromPayload(parsed?.chunk) ??
        extractTextFromPayload(parsed?.text) ??
        extractTextFromPayload(parsed?.content) ??
        extractTextFromPayload(parsed?.message);
      if (chunk) {
        collectedText += chunk;
      } else if (rawText) {
        collectedText += rawText;
      }
    } else if (eventName === 'done' || eventName === 'complete') {
      const text =
        extractTextFromPayload(parsed?.text) ??
        extractTextFromPayload(parsed?.message) ??
        extractTextFromPayload(parsed?.content);
      if (text) {
        finalText = text;
      } else if (rawText) {
        finalText = rawText;
      }
    } else if (eventName === 'message' || eventName === 'agent_message') {
      const text =
        extractTextFromPayload(parsed?.text) ??
        extractTextFromPayload(parsed?.content) ??
        extractTextFromPayload(parsed?.message);
      if (text) {
        finalText = text;
      } else if (rawText) {
        finalText = rawText;
      }
    } else if (eventName === 'error') {
      const errorText = parsed?.error ?? parsed?.message ?? dataRaw;
      if (typeof errorText === 'string') {
        errorMessage = errorText;
      }
    } else if (!eventName) {
      if (typeof parsed?.text === 'string' && !finalText) {
        finalText = parsed.text;
      } else if (rawText) {
        collectedText += rawText;
      }
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
  if (buffer.length > 0) {
    if (buffer.startsWith('event:')) {
      eventName = buffer.slice(6).trim();
    } else if (buffer.startsWith('data:')) {
      dataLines.push(buffer.slice(5).trim());
    } else if (buffer.trim() === '') {
      flushEvent();
    }
  }
  flushEvent();

  return {
    text: finalText ?? (collectedText ? collectedText : null),
    error: errorMessage,
  };
};

type SessionMessage = {
  id?: string;
  content?: string;
  authorId?: string;
  isAgent?: boolean;
  createdAt?: string | number;
  metadata?: Record<string, unknown>;
};

type SessionMessagesResponse = {
  messages?: SessionMessage[];
  hasMore?: boolean;
  cursors?: {
    before?: number;
    after?: number;
  };
};

const selectAgentReplyFromMessages = (
  messages: SessionMessage[] | undefined,
  sentAtMs: number,
): string | null => {
  if (!messages || messages.length === 0) {
    return null;
  }
  const threshold = sentAtMs - 5_000;
  const candidates = messages
    .filter(
      (message) =>
        message?.isAgent === true &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0,
    )
    .map((message) => ({
      content: message.content!.trim(),
      ts: parseMessageTimestamp(message.createdAt) ?? 0,
    }));
  if (candidates.length === 0) {
    return null;
  }
  const recent = candidates.filter((candidate) => candidate.ts >= threshold);
  const pool = recent.length > 0 ? recent : candidates;
  pool.sort((a, b) => b.ts - a.ts);
  return pool[0]?.content ?? null;
};

const parseMessageTimestamp = (value: string | number | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    const normalized = trimmed.endsWith('Z') ? trimmed : `${trimmed}Z`;
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const fetchSessionMessages = async (params: {
  elizaServerUrl: string;
  authToken?: string;
  sessionId: string;
  after?: number | null;
  limit?: number;
  timeoutMs?: number;
}): Promise<SessionMessagesResponse | null> => {
  const limit = params.limit ?? 20;
  const query = new URLSearchParams();
  query.set('limit', String(limit));
  if (typeof params.after === 'number' && Number.isFinite(params.after)) {
    query.set('after', String(params.after));
  }
  const url = `${params.elizaServerUrl}/api/messaging/sessions/${params.sessionId}/messages?${query.toString()}`;
  const res = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: buildElizaHeaders(params.authToken),
    },
    params.timeoutMs,
  );
  const text = await res.text();
  if (!res.ok) {
    logElizaResponse('messages', res.status, text);
    return null;
  }
  let parsed: SessionMessagesResponse | null = null;
  try {
    parsed = text ? (JSON.parse(text) as SessionMessagesResponse) : null;
  } catch {
    parsed = null;
  }
  return parsed;
};

const pollForSessionReply = async (params: {
  elizaServerUrl: string;
  authToken?: string;
  sessionId: string;
  sentAtMs: number;
  timeoutMs?: number;
}): Promise<string | null> => {
  const deadline = params.timeoutMs ? Date.now() + params.timeoutMs : Date.now() + 5_000;
  let afterCursor: number | null = null;
  while (Date.now() < deadline) {
    const remainingMs = Math.max(0, deadline - Date.now());
    const response = await fetchSessionMessages({
      elizaServerUrl: params.elizaServerUrl,
      authToken: params.authToken,
      sessionId: params.sessionId,
      after: afterCursor,
      limit: 20,
      timeoutMs: Math.min(remainingMs, 5_000),
    });
    const messageText = selectAgentReplyFromMessages(response?.messages, params.sentAtMs);
    if (messageText) {
      return messageText;
    }
    if (response?.cursors?.after !== undefined) {
      afterCursor = response.cursors.after;
    }
    if (remainingMs <= 600) {
      break;
    }
    await sleep(500);
  }
  return null;
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

type SessionSendResult =
  | { ok: true; text: string | null; modeUsed: 'stream' | 'poll' | 'direct' }
  | { ok: false; status: number; body: string; modeUsed: 'stream' | 'poll' | 'direct' };

const sendMessageWithSession = async (params: {
  elizaServerUrl: string;
  authToken?: string;
  sessionId: string;
  message: string;
  senderId: string;
  conversationId: string;
  timeoutMs?: number;
  mode?: 'auto' | 'stream' | 'poll';
  allowPollFallback?: boolean;
  allowStreamFallback?: boolean;
}): Promise<SessionSendResult> => {
  const sentAtMs = Date.now();
  const pollTimeoutMs =
    typeof params.timeoutMs === 'number' ? Math.min(5_000, params.timeoutMs) : 5_000;
  const messageSummary = summarizeForLog(params.message);
  const requestedMode = params.mode ?? 'auto';
  const pollOnly =
    requestedMode === 'poll' ? true : requestedMode === 'stream' ? false : shouldPollOnly();
  const allowPollFallback = params.allowPollFallback ?? true;
  const allowStreamFallback =
    params.allowStreamFallback ??
    (requestedMode === 'auto' ? shouldAllowPollOnlySseFallback() : false);

  const sendStreamRequest = async (): Promise<SessionSendResult> => {
    const payload = {
      content: messageSummary,
      mode: 'stream',
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
        }),
      },
      params.timeoutMs,
    );
    if (!res.ok) {
      const text = await res.text();
      logElizaResponse('messaging', res.status, text);
      return { ok: false as const, status: res.status, body: text, modeUsed: 'stream' };
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      const textBody = await res.text();
      let parsed: unknown = null;
      try {
        parsed = textBody ? JSON.parse(textBody) : null;
      } catch {
        parsed = null;
      }
      const extracted = extractTextFromPayload(parsed) ?? (textBody.trim() ? textBody.trim() : null);
      logElizaResponse('messaging', 200, textBody);
      if (extracted) {
        return { ok: true as const, text: extracted, modeUsed: 'direct' };
      }
      if (allowPollFallback) {
        const fallback = await pollForSessionReply({
          elizaServerUrl: params.elizaServerUrl,
          authToken: params.authToken,
          sessionId: params.sessionId,
          sentAtMs,
          timeoutMs: pollTimeoutMs,
        });
        if (shouldLogElizaApi()) {
          console.log('[ELIZA_API_DEBUG] messaging poll', {
            sessionId: params.sessionId,
            result: fallback ? 'hit' : 'miss',
          });
        }
        return { ok: true as const, text: fallback, modeUsed: 'poll' };
      }
      return { ok: true as const, text: null, modeUsed: 'direct' };
    }
    const { text, error } = await parseSseStream(res);
    if (!error && text) {
      logElizaResponse('messaging', 200, text ?? '');
      return { ok: true as const, text, modeUsed: 'stream' };
    }
    if (error) {
      logElizaResponse('messaging', 200, error);
    } else {
      logElizaResponse('messaging', 200, text ?? '');
    }
    if (allowPollFallback) {
      const fallback = await pollForSessionReply({
        elizaServerUrl: params.elizaServerUrl,
        authToken: params.authToken,
        sessionId: params.sessionId,
        sentAtMs,
        timeoutMs: pollTimeoutMs,
      });
      if (shouldLogElizaApi()) {
        console.log('[ELIZA_API_DEBUG] messaging poll', {
          sessionId: params.sessionId,
          result: fallback ? 'hit' : 'miss',
        });
      }
      if (fallback) {
        return { ok: true as const, text: fallback, modeUsed: 'poll' };
      }
    }
    if (error) {
      return { ok: false as const, status: 200, body: error, modeUsed: 'stream' };
    }
    return { ok: true as const, text: null, modeUsed: 'stream' };
  };

  if (pollOnly) {
    const payload = {
      content: messageSummary,
    };
    const headers = {
      ...buildElizaHeaders(params.authToken),
      Accept: 'application/json',
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
        }),
      },
      params.timeoutMs,
    );
    if (!res.ok) {
      const text = await res.text();
      logElizaResponse('messaging', res.status, text);
      return { ok: false as const, status: res.status, body: text, modeUsed: 'poll' };
    }
    const textBody = await res.text();
    logElizaResponse('messaging', 200, textBody);
    const fallback = await pollForSessionReply({
      elizaServerUrl: params.elizaServerUrl,
      authToken: params.authToken,
      sessionId: params.sessionId,
      sentAtMs,
      timeoutMs: pollTimeoutMs,
    });
    if (shouldLogElizaApi()) {
      console.log('[ELIZA_API_DEBUG] messaging poll', {
        sessionId: params.sessionId,
        result: fallback ? 'hit' : 'miss',
      });
    }
    if (fallback) {
      return { ok: true as const, text: fallback, modeUsed: 'poll' };
    }
    if (allowStreamFallback) {
      return await sendStreamRequest();
    }
    // In strict poll-only mode, do not fall back to SSE. Treat a miss as a pass.
    return { ok: true as const, text: null, modeUsed: 'poll' };
  }
  return await sendStreamRequest();
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
    communicationMode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ inputId: Id<"inputs"> | string; elizaAgentId: string }> => {
    // 1. Create in ElizaOS
    const elizaServerUrlOverride = normalizeElizaServerUrl(args.elizaServerUrl);
    const elizaServerUrl = elizaServerUrlOverride ?? DEFAULT_ELIZA_SERVER;
    const authToken = resolveElizaAuthToken(args.elizaAuthToken);
    const storedAuthToken = normalizeAuthToken(args.elizaAuthToken);
    const normalizedMode = normalizeCommunicationMode(args.communicationMode);
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
         communicationMode: normalizedMode ?? undefined,
         communicationVerifiedAt: normalizedMode ? Date.now() : undefined,
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

export const connectExistingElizaAgent = action({
  args: {
    worldId: v.id('worlds'),
    name: v.string(),
    character: v.string(),
    identity: v.string(),
    plan: v.string(),
    personality: v.array(v.string()),
    elizaAgentId: v.string(),
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
    communicationMode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ inputId: Id<'inputs'> | string; elizaAgentId: string }> => {
    const elizaServerUrlOverride = normalizeElizaServerUrl(args.elizaServerUrl);
    const elizaServerUrl = elizaServerUrlOverride ?? DEFAULT_ELIZA_SERVER;
    const authToken = resolveElizaAuthToken(args.elizaAuthToken);
    const storedAuthToken = normalizeAuthToken(args.elizaAuthToken);
    const normalizedMode = normalizeCommunicationMode(args.communicationMode);
    if (!normalizedMode) {
      throw new Error('Run the connection test before adding this agent.');
    }

    const inputId: any = await ctx.runMutation(apiAny.world.createAgent, {
      worldId: args.worldId,
      name: args.name,
      character: args.character,
      identity: args.identity,
      plan: args.plan,
    });

    await ctx.runMutation(apiAny.elizaAgent.mutations.saveMapping, {
      worldId: args.worldId,
      name: args.name,
      elizaAgentId: args.elizaAgentId,
      bio: args.identity,
      personality: args.personality,
      elizaServerUrl: elizaServerUrlOverride,
      elizaAuthToken: storedAuthToken,
      communicationMode: normalizedMode,
      communicationVerifiedAt: Date.now(),
    });

    try {
      await ensureElizaWorld({
        ctx,
        elizaAgentId: args.elizaAgentId,
        elizaServerUrl,
        authToken,
        agentName: args.name,
      });
    } catch (error) {
      console.error('Eliza world initialization failed', error);
    }

    return { inputId, elizaAgentId: args.elizaAgentId };
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
  preferredMode?: string;
  strictMode?: boolean;
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
  const requestedMode = normalizeCommunicationMode(args.preferredMode);
  let storedMode: CommunicationMode | null = null;
  if (!requestedMode) {
    try {
      const mapping = await ctx.runQuery(apiAny.elizaAgent.queries.getByElizaAgentId, {
        elizaAgentId: args.elizaAgentId,
      });
      storedMode = normalizeCommunicationMode(mapping?.communicationMode ?? undefined);
    } catch (error) {
      if (shouldLogElizaApi()) {
        console.log('[ELIZA_API_DEBUG] communication mode lookup failed', {
          elizaAgentId: args.elizaAgentId,
          error: (error as Error)?.message ?? error,
        });
      }
    }
  }
  const preferredMode = requestedMode ?? storedMode;
  const strictMode = args.strictMode === true;

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

    const tryLegacy = async (): Promise<string | null> => {
      if (skipLegacy) {
        if (shouldLogElizaApi() && shouldLogElizaVerbose()) {
          console.log('[ELIZA_API_DEBUG] legacy skipped', { reason: 'ELIZA_DISABLE_LEGACY' });
        }
        return null;
      }
      const legacyResult = await sendLegacyMessage({
        elizaServerUrl,
        authToken,
        elizaAgentId: args.elizaAgentId,
        message: args.message,
        userId: elizaUserId,
        conversationId: args.conversationId,
        timeoutMs: remainingMs(),
      });
      legacyStatus = legacyResult.status;
      legacyBody = legacyResult.body ?? '';
      return legacyResult.text;
    };

    const allowLegacy = !skipLegacy;
    const allowMessaging = preferredMode !== 'legacy' || !strictMode;
    const preferLegacyFirst = allowLegacy && (preferredMode === null || preferredMode === 'legacy');

    if (preferLegacyFirst) {
      const legacyReply = await tryLegacy();
      if (legacyReply) {
        return legacyReply;
      }
      if (preferredMode === 'legacy' && strictMode) {
        return null;
      }
    }

    if (!allowMessaging) {
      return null;
    }

    const messagingMode =
      preferredMode === 'messaging-poll'
        ? 'poll'
        : preferredMode === 'messaging-stream'
          ? 'stream'
          : 'auto';

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
      mode: messagingMode,
      allowPollFallback: strictMode && messagingMode === 'stream' ? false : undefined,
      allowStreamFallback: strictMode && messagingMode === 'poll' ? false : undefined,
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
          mode: messagingMode,
          allowPollFallback: strictMode && messagingMode === 'stream' ? false : undefined,
          allowStreamFallback: strictMode && messagingMode === 'poll' ? false : undefined,
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
      if (!strictMode && allowLegacy) {
        const legacyReply = await tryLegacy();
        if (legacyReply) {
          return legacyReply;
        }
      }
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
    if (firstAttempt.text) {
      return firstAttempt.text;
    }
    if (!strictMode && allowLegacy) {
      const legacyReply = await tryLegacy();
      if (legacyReply) {
        return legacyReply;
      }
    }
    return null;
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

export const testElizaAgentCommunication = action({
  args: {
    elizaAgentId: v.string(),
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const elizaServerUrl = normalizeElizaServerUrl(args.elizaServerUrl) ?? DEFAULT_ELIZA_SERVER;
    const authToken = resolveElizaAuthToken(args.elizaAuthToken);
    const pingMessage =
      'Eliza Town connection test ping. Please reply with a short acknowledgement.';
    const helloMessage = 'Hello, this is Eliza Town. Are you there?';
    const introMessage = 'Can you introduce yourself?';
    const diagnostics: {
      legacy: CommunicationDiagnostics;
      streaming: CommunicationDiagnostics;
      queue: CommunicationDiagnostics;
    } = {
      legacy: { ok: false, message: 'Not tested.' },
      streaming: { ok: false, message: 'Not tested.' },
      queue: { ok: false, message: 'Not tested.' },
    };
    const diagnosticTimeoutMs = 8_000;
    const handshakeTimeoutMs = 12_000;
    const userId = await getOrCreateElizaOwnerId(ctx);

    if (shouldSkipLegacy()) {
      diagnostics.legacy = {
        ok: false,
        message: 'Legacy messaging disabled by server configuration.',
      };
    } else {
      try {
        const legacyResult = await sendLegacyMessage({
          elizaServerUrl,
          authToken,
          elizaAgentId: args.elizaAgentId,
          message: pingMessage,
          userId,
          conversationId: `eliza-test:${createUuid()}:legacy`,
          timeoutMs: diagnosticTimeoutMs,
        });
        if (legacyResult.text) {
          diagnostics.legacy = { ok: true, message: legacyResult.text };
        } else if (legacyResult.ok) {
          diagnostics.legacy = { ok: false, message: 'Legacy response was empty.' };
        } else {
          diagnostics.legacy = {
            ok: false,
            message: legacyResult.body
              ? `Legacy error: ${summarizeForLog(legacyResult.body, 200)}`
              : `Legacy error (HTTP ${legacyResult.status}).`,
          };
        }
      } catch (error: any) {
        diagnostics.legacy = {
          ok: false,
          message: error?.message ?? 'Legacy request failed.',
        };
      }
    }

    try {
      const conversationId = `eliza-test:${createUuid()}:stream`;
      const session = await createMessagingSession({
        ctx,
        elizaAgentId: args.elizaAgentId,
        elizaServerUrl,
        authToken,
        conversationId,
        userId,
        timeoutMs: diagnosticTimeoutMs,
      });
      const streamResult = await sendMessageWithSession({
        elizaServerUrl,
        authToken,
        message: pingMessage,
        senderId: userId,
        conversationId,
        sessionId: session.sessionId,
        timeoutMs: diagnosticTimeoutMs,
        mode: 'stream',
        allowPollFallback: false,
      });
      if (streamResult.ok && streamResult.text && streamResult.modeUsed === 'stream') {
        diagnostics.streaming = { ok: true, message: streamResult.text };
      } else if (streamResult.ok && streamResult.text) {
        diagnostics.streaming = {
          ok: false,
          message: 'Streaming did not return SSE data.',
        };
      } else if (!streamResult.ok) {
        diagnostics.streaming = {
          ok: false,
          message: streamResult.body
            ? `Streaming error: ${summarizeForLog(streamResult.body, 200)}`
            : `Streaming error (HTTP ${streamResult.status}).`,
        };
      } else {
        diagnostics.streaming = { ok: false, message: 'Streaming response was empty.' };
      }
    } catch (error: any) {
      diagnostics.streaming = {
        ok: false,
        message: error?.message ?? 'Streaming test failed.',
      };
    }

    try {
      const conversationId = `eliza-test:${createUuid()}:queue`;
      const session = await createMessagingSession({
        ctx,
        elizaAgentId: args.elizaAgentId,
        elizaServerUrl,
        authToken,
        conversationId,
        userId,
        timeoutMs: diagnosticTimeoutMs,
      });
      const queueResult = await sendMessageWithSession({
        elizaServerUrl,
        authToken,
        message: pingMessage,
        senderId: userId,
        conversationId,
        sessionId: session.sessionId,
        timeoutMs: diagnosticTimeoutMs,
        mode: 'poll',
        allowStreamFallback: false,
      });
      if (queueResult.ok && queueResult.text && queueResult.modeUsed === 'poll') {
        diagnostics.queue = { ok: true, message: queueResult.text };
      } else if (!queueResult.ok) {
        diagnostics.queue = {
          ok: false,
          message: queueResult.body
            ? `Queue error: ${summarizeForLog(queueResult.body, 200)}`
            : `Queue error (HTTP ${queueResult.status}).`,
        };
      } else {
        diagnostics.queue = { ok: false, message: 'Queue response was empty.' };
      }
    } catch (error: any) {
      diagnostics.queue = {
        ok: false,
        message: error?.message ?? 'Queue test failed.',
      };
    }

    const preferredMode: CommunicationMode | null = diagnostics.streaming.ok
      ? 'messaging-stream'
      : diagnostics.queue.ok
        ? 'messaging-poll'
        : diagnostics.legacy.ok
          ? 'legacy'
          : null;

    if (!preferredMode) {
      return {
        ok: false,
        message: 'No supported communication method responded.',
        diagnostics,
      };
    }

    const conversationId = `eliza-test:${createUuid()}:handshake`;
    const senderId = `eliza-test-user:${createUuid()}`;
    const messages: CommunicationTestMessage[] = [
      { role: 'user', text: helloMessage },
    ];
    const helloReply = await sendElizaMessage(ctx, {
      elizaAgentId: args.elizaAgentId,
      elizaServerUrl,
      elizaAuthToken: args.elizaAuthToken,
      message: helloMessage,
      senderId,
      conversationId,
      timeoutMs: handshakeTimeoutMs,
      preferredMode,
      strictMode: true,
    });
    if (!helloReply) {
      return {
        ok: false,
        message: 'No reply to the greeting prompt.',
        preferredMode,
        diagnostics,
        conversation: { conversationId, senderId, messages },
      };
    }
    messages.push({ role: 'agent', text: helloReply });

    messages.push({ role: 'user', text: introMessage });
    const introReply = await sendElizaMessage(ctx, {
      elizaAgentId: args.elizaAgentId,
      elizaServerUrl,
      elizaAuthToken: args.elizaAuthToken,
      message: introMessage,
      senderId,
      conversationId,
      timeoutMs: handshakeTimeoutMs,
      preferredMode,
      strictMode: true,
    });
    if (!introReply) {
      return {
        ok: false,
        message: 'No reply to the introduction prompt.',
        preferredMode,
        diagnostics,
        conversation: { conversationId, senderId, messages },
      };
    }
    messages.push({ role: 'agent', text: introReply });

    return {
      ok: true,
      preferredMode,
      diagnostics,
      conversation: { conversationId, senderId, messages },
    };
  },
});

export const sendElizaTestMessage = action({
  args: {
    elizaAgentId: v.string(),
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
    message: v.string(),
    senderId: v.string(),
    conversationId: v.string(),
    preferredMode: v.string(),
  },
  handler: async (ctx, args) => {
    const response = await sendElizaMessage(ctx, {
      elizaAgentId: args.elizaAgentId,
      elizaServerUrl: args.elizaServerUrl,
      elizaAuthToken: args.elizaAuthToken,
      message: args.message,
      senderId: args.senderId,
      conversationId: args.conversationId,
      timeoutMs: 12_000,
      preferredMode: args.preferredMode,
      strictMode: true,
    });
    if (!response) {
      return { ok: false, message: 'No reply from agent.' };
    }
    return { ok: true, reply: response };
  },
});

export const fetchElizaAgentInfo = action({
  args: {
    elizaAgentId: v.string(),
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const elizaServerUrl = normalizeElizaServerUrl(args.elizaServerUrl) ?? DEFAULT_ELIZA_SERVER;
    const authToken = resolveElizaAuthToken(args.elizaAuthToken);
    const url = `${elizaServerUrl}/api/agents/${args.elizaAgentId}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: buildElizaHeaders(authToken),
      },
      10_000,
    );
    const text = await res.text();
    const parsed = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })();
    const agent = parsed ? extractAgentSummary(parsed) : null;
    const raw = res.ok ? (parsed ?? text) : null;
    return {
      ok: res.ok,
      status: res.status,
      agent,
      raw,
      message: res.ok ? undefined : truncateBody(text),
    };
  },
});

export const fetchElizaAgentByName = action({
  args: {
    name: v.string(),
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const elizaServerUrl = normalizeElizaServerUrl(args.elizaServerUrl) ?? DEFAULT_ELIZA_SERVER;
    const authToken = resolveElizaAuthToken(args.elizaAuthToken);
    const url = `${elizaServerUrl}/api/agents`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: buildElizaHeaders(authToken),
      },
      10_000,
    );
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const agents = parsed ? extractAgentList(parsed) : [];
    const target = args.name.trim().toLowerCase();
    const exactMatches = agents.filter((agent) => {
      const name = agent.name?.toLowerCase();
      const username = agent.username?.toLowerCase();
      return (name && name === target) || (username && username === target);
    });
    const looseMatches = exactMatches.length
      ? exactMatches
      : agents.filter((agent) => {
          const name = agent.name?.toLowerCase();
          const username = agent.username?.toLowerCase();
          return (
            (name && name.includes(target)) ||
            (username && username.includes(target))
          );
        });
    const chosen = looseMatches[0] ?? null;
    const candidates = looseMatches.slice(0, 5).map((agent) => ({
      id: agent.id,
      name: agent.name,
      username: agent.username,
    }));
    return {
      ok: res.ok,
      status: res.status,
      agent: chosen,
      candidates,
      message: res.ok ? undefined : truncateBody(text),
    };
  },
});

export const fetchElizaAgents = action({
  args: {
    elizaServerUrl: v.optional(v.string()),
    elizaAuthToken: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const elizaServerUrl = normalizeElizaServerUrl(args.elizaServerUrl) ?? DEFAULT_ELIZA_SERVER;
    const authToken = resolveElizaAuthToken(args.elizaAuthToken);
    const url = `${elizaServerUrl}/api/agents`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: buildElizaHeaders(authToken),
      },
      10_000,
    );
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const agents = parsed ? extractAgentList(parsed) : [];
    return {
      ok: res.ok,
      status: res.status,
      agents,
      message: res.ok ? undefined : truncateBody(text),
    };
  },
});

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
