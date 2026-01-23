import { ConvexError } from 'convex/values';
import type { DatabaseWriter } from '../_generated/server';

export const IDEMPOTENCY_SCOPES = {
  queueJoin: 'queue.join',
  queueLeave: 'queue.leave',
  matchReady: 'match.ready',
  matchSayPublic: 'match.public_message',
  matchVote: 'match.vote',
  matchWolfChat: 'match.night.wolf_chat',
  matchWolfKill: 'match.night.wolf_kill',
  matchSeerInspect: 'match.night.seer_inspect',
  matchDoctorProtect: 'match.night.doctor_protect',
} as const;

export type IdempotencyScope = (typeof IDEMPOTENCY_SCOPES)[keyof typeof IDEMPOTENCY_SCOPES];

export type IdempotencyRecord<Result = unknown> = {
  scope: IdempotencyScope | string;
  key: string;
  playerId: string;
  matchId?: string;
  result: Result;
  createdAt: number;
};

export type IdempotencyStore = {
  get: (scope: string, key: string) => Promise<IdempotencyRecord | null>;
  put: (record: IdempotencyRecord) => Promise<void>;
};

export function createIdempotencyStore(db: DatabaseWriter): IdempotencyStore {
  return {
    async get(scope, key) {
      const record = await db
        .query('werewolfIdempotency')
        .withIndex('byScopeAndKey', (q) => q.eq('scope', scope).eq('key', key))
        .first();
      if (!record) {
        return null;
      }
      return {
        scope: record.scope,
        key: record.key,
        playerId: record.playerId,
        matchId: record.matchId,
        result: record.result,
        createdAt: record.createdAt,
      };
    },
    async put(record) {
      await db.insert('werewolfIdempotency', record);
    },
  };
}

export function assertIdempotencyRecordMatches(
  record: IdempotencyRecord,
  params: { playerId: string; matchId?: string },
): void {
  if (record.playerId !== params.playerId) {
    throw new ConvexError('Idempotency key already used by another player.');
  }
  const recordMatch = record.matchId ?? null;
  const paramsMatch = params.matchId ?? null;
  if (recordMatch !== paramsMatch) {
    throw new ConvexError('Idempotency key already used for another match.');
  }
}

export async function runWithIdempotency<Result>(params: {
  store: IdempotencyStore;
  scope: string;
  key?: string;
  playerId: string;
  matchId?: string;
  now: number;
  run: () => Promise<Result>;
}): Promise<{ result: Result; reused: boolean }> {
  if (!params.key) {
    const result = await params.run();
    return { result, reused: false };
  }

  const existing = await params.store.get(params.scope, params.key);
  if (existing) {
    assertIdempotencyRecordMatches(existing, {
      playerId: params.playerId,
      matchId: params.matchId,
    });
    return { result: existing.result as Result, reused: true };
  }

  const result = await params.run();
  const record: IdempotencyRecord<Result> = {
    scope: params.scope,
    key: params.key,
    playerId: params.playerId,
    result,
    createdAt: params.now,
  };
  if (params.matchId !== undefined) {
    record.matchId = params.matchId;
  }
  await params.store.put(record);
  return { result, reused: false };
}
