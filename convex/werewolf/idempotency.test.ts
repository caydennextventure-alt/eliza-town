import { runWithIdempotency, type IdempotencyRecord, type IdempotencyStore } from './idempotency';

class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async get(scope: string, key: string): Promise<IdempotencyRecord | null> {
    return this.records.get(`${scope}:${key}`) ?? null;
  }

  async put(record: IdempotencyRecord): Promise<void> {
    this.records.set(`${record.scope}:${record.key}`, record);
  }

  count(): number {
    return this.records.size;
  }
}

describe('runWithIdempotency', () => {
  it('reuses stored results and avoids duplicate side effects', async () => {
    const store = new MemoryIdempotencyStore();
    const events: string[] = [];

    const run = async () => {
      events.push('event');
      return { eventId: String(events.length) };
    };

    const first = await runWithIdempotency({
      store,
      scope: 'match.vote',
      key: 'key-123',
      playerId: 'p:1',
      matchId: 'match:1',
      now: 100,
      run,
    });

    const second = await runWithIdempotency({
      store,
      scope: 'match.vote',
      key: 'key-123',
      playerId: 'p:1',
      matchId: 'match:1',
      now: 200,
      run,
    });

    expect(first.result).toEqual({ eventId: '1' });
    expect(second.result).toEqual({ eventId: '1' });
    expect(second.reused).toBe(true);
    expect(events).toEqual(['event']);
    expect(store.count()).toBe(1);
  });

  it('throws when a key is reused for a different player or match', async () => {
    const store = new MemoryIdempotencyStore();

    await runWithIdempotency({
      store,
      scope: 'match.vote',
      key: 'key-456',
      playerId: 'p:1',
      matchId: 'match:1',
      now: 100,
      run: async () => ({ ok: true }),
    });

    await expect(
      runWithIdempotency({
        store,
        scope: 'match.vote',
        key: 'key-456',
        playerId: 'p:2',
        matchId: 'match:1',
        now: 200,
        run: async () => ({ ok: true }),
      }),
    ).rejects.toThrow('Idempotency key already used by another player.');

    await expect(
      runWithIdempotency({
        store,
        scope: 'match.vote',
        key: 'key-456',
        playerId: 'p:1',
        matchId: 'match:2',
        now: 300,
        run: async () => ({ ok: true }),
      }),
    ).rejects.toThrow('Idempotency key already used for another match.');
  });

  it('runs normally when no key is provided', async () => {
    const store = new MemoryIdempotencyStore();
    let count = 0;

    const run = async () => {
      count += 1;
      return { count };
    };

    const first = await runWithIdempotency({
      store,
      scope: 'queue.join',
      playerId: 'p:9',
      now: 100,
      run,
    });

    const second = await runWithIdempotency({
      store,
      scope: 'queue.join',
      playerId: 'p:9',
      now: 200,
      run,
    });

    expect(first.result).toEqual({ count: 1 });
    expect(second.result).toEqual({ count: 2 });
    expect(store.count()).toBe(0);
  });
});
