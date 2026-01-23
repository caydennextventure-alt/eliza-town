import {
  DEFAULT_QUEUE_ID,
  REQUIRED_PLAYERS,
  assertSupportedQueueId,
  buildQueueStatus,
  buildInitialPhaseAdvanceJob,
  normalizePreferredDisplayName,
  validateIdempotencyKey,
} from './queue';

describe('buildQueueStatus', () => {
  it('computes position based on joinedAt ordering', () => {
    const entries = [
      { playerId: 'p:2', joinedAt: 200 },
      { playerId: 'p:1', joinedAt: 100 },
      { playerId: 'p:3', joinedAt: 150 },
    ];

    const status = buildQueueStatus(DEFAULT_QUEUE_ID, entries, 'p:3');

    expect(status.position).toBe(2);
    expect(status.size).toBe(3);
    expect(status.status).toBe('WAITING');
  });

  it('returns null position when player is not queued', () => {
    const status = buildQueueStatus(
      DEFAULT_QUEUE_ID,
      [
        { playerId: 'p:1', joinedAt: 100 },
        { playerId: 'p:2', joinedAt: 200 },
      ],
      'p:9',
    );

    expect(status.position).toBeNull();
  });

  it('marks queue as STARTING once required size is reached', () => {
    const entries = Array.from({ length: REQUIRED_PLAYERS }, (_, index) => ({
      playerId: `p:${index + 1}`,
      joinedAt: index + 1,
    }));

    const status = buildQueueStatus(DEFAULT_QUEUE_ID, entries, 'p:1');

    expect(status.status).toBe('STARTING');
    expect(status.requiredPlayers).toBe(REQUIRED_PLAYERS);
  });
});

describe('queue argument validation', () => {
  it('rejects unsupported queue IDs', () => {
    expect(() => assertSupportedQueueId('other-queue')).toThrow('Unsupported queueId');
  });

  it('normalizes preferred display names', () => {
    expect(normalizePreferredDisplayName('  Alice ')).toBe('Alice');
  });

  it('rejects empty display names', () => {
    expect(() => normalizePreferredDisplayName('   ')).toThrow('Display name cannot be empty.');
  });

  it('rejects overly long display names', () => {
    const tooLong = 'a'.repeat(33);
    expect(() => normalizePreferredDisplayName(tooLong)).toThrow('Display name exceeds 32');
  });

  it('rejects invalid idempotency keys', () => {
    expect(() => validateIdempotencyKey('short')).toThrow('Idempotency key length is invalid.');
  });
});

describe('buildInitialPhaseAdvanceJob', () => {
  it('returns null when the match is already ended', () => {
    const schedule = buildInitialPhaseAdvanceJob({
      matchId: 'match:1',
      phase: 'ENDED',
      phaseEndsAt: 1000,
      now: 900,
    });

    expect(schedule).toBeNull();
  });

  it('builds scheduler args and delay from phase timing', () => {
    const schedule = buildInitialPhaseAdvanceJob({
      matchId: 'match:2',
      phase: 'LOBBY',
      phaseEndsAt: 2000,
      now: 1500,
    });

    expect(schedule).toEqual({
      delayMs: 500,
      args: {
        matchId: 'match:2',
        expectedPhase: 'LOBBY',
        expectedPhaseEndsAt: 2000,
      },
    });
  });

  it('clamps delays to zero when the phase is overdue', () => {
    const schedule = buildInitialPhaseAdvanceJob({
      matchId: 'match:3',
      phase: 'NIGHT',
      phaseEndsAt: 1000,
      now: 1500,
    });

    expect(schedule?.delayMs).toBe(0);
  });
});
