import { buildKeyMoments, buildVoteTally, formatCountdown } from './spectatorUtils';

describe('formatCountdown', () => {
  it('formats remaining seconds as mm:ss', () => {
    const end = '2024-01-01T00:00:05.000Z';
    const now = Date.parse('2024-01-01T00:00:00.000Z');

    const countdown = formatCountdown(end, now);

    expect(countdown.remainingSeconds).toBe(5);
    expect(countdown.label).toBe('0:05');
    expect(countdown.isExpired).toBe(false);
  });

  it('clamps expired timers to zero', () => {
    const end = '2024-01-01T00:00:05.000Z';
    const now = Date.parse('2024-01-01T00:00:12.000Z');

    const countdown = formatCountdown(end, now);

    expect(countdown.remainingSeconds).toBe(0);
    expect(countdown.label).toBe('0:00');
    expect(countdown.isExpired).toBe(true);
  });

  it('handles invalid timestamps', () => {
    const countdown = formatCountdown('not-a-date', 0);

    expect(countdown.label).toBe('--:--');
    expect(countdown.isExpired).toBe(true);
  });
});

describe('buildVoteTally', () => {
  it('uses the latest vote per alive voter', () => {
    const players = [
      { playerId: 'p1', displayName: 'Ada', alive: true },
      { playerId: 'p2', displayName: 'Ben', alive: true },
      { playerId: 'p3', displayName: 'Cy', alive: false },
    ];

    const events = [
      {
        eventId: '1',
        at: '2024-01-01T00:00:00.000Z',
        type: 'VOTE_CAST',
        payload: { voterPlayerId: 'p1', targetPlayerId: 'p2' },
      },
      {
        eventId: '2',
        at: '2024-01-01T00:00:01.000Z',
        type: 'VOTE_CAST',
        payload: { voterPlayerId: 'p2', targetPlayerId: 'p1' },
      },
      {
        eventId: '3',
        at: '2024-01-01T00:00:02.000Z',
        type: 'VOTE_CAST',
        payload: { voterPlayerId: 'p2', targetPlayerId: null },
      },
      {
        eventId: '4',
        at: '2024-01-01T00:00:03.000Z',
        type: 'VOTE_CAST',
        payload: { voterPlayerId: 'p3', targetPlayerId: 'p1' },
      },
    ];

    const tally = buildVoteTally(events, players);

    const benVotes = tally.find((entry) => entry.targetLabel === 'Ben');
    const abstainVotes = tally.find((entry) => entry.targetLabel === 'Abstain');

    expect(benVotes?.count).toBe(1);
    expect(benVotes?.voters).toEqual(['Ada']);
    expect(abstainVotes?.count).toBe(1);
    expect(abstainVotes?.voters).toEqual(['Ben']);
    expect(tally.some((entry) => entry.targetLabel === 'Ada')).toBe(false);
  });

  it('resets votes after the latest DAY_VOTE transition', () => {
    const players = [
      { playerId: 'p1', displayName: 'Ada', alive: true },
      { playerId: 'p2', displayName: 'Ben', alive: true },
    ];

    const events = [
      {
        eventId: '1',
        at: '2024-01-01T00:00:00.000Z',
        type: 'PHASE_CHANGED',
        payload: { from: 'DAY_DISCUSSION', to: 'DAY_VOTE', dayNumber: 1, phaseEndsAt: 0 },
      },
      {
        eventId: '2',
        at: '2024-01-01T00:00:01.000Z',
        type: 'VOTE_CAST',
        payload: { voterPlayerId: 'p1', targetPlayerId: 'p2' },
      },
      {
        eventId: '3',
        at: '2024-01-01T00:02:00.000Z',
        type: 'PHASE_CHANGED',
        payload: { from: 'DAY_DISCUSSION', to: 'DAY_VOTE', dayNumber: 2, phaseEndsAt: 0 },
      },
    ];

    const tally = buildVoteTally(events, players);

    expect(tally).toEqual([]);
  });
});

describe('buildKeyMoments', () => {
  it('returns the most recent key moments with readable labels', () => {
    const playerNames = new Map([
      ['p1', 'Ada'],
      ['p2', 'Ben'],
    ]);

    const events = [
      {
        eventId: '1',
        at: '2024-01-01T00:00:00.000Z',
        type: 'VOTE_CAST',
        payload: { voterPlayerId: 'p1', targetPlayerId: 'p2' },
      },
      {
        eventId: '2',
        at: '2024-01-01T00:00:01.000Z',
        type: 'NIGHT_RESULT',
        payload: { killedPlayerId: 'p2', savedByDoctor: false },
      },
      {
        eventId: '3',
        at: '2024-01-01T00:00:02.000Z',
        type: 'PLAYER_ELIMINATED',
        payload: { playerId: 'p1', roleRevealed: 'WEREWOLF' },
      },
    ];

    const moments = buildKeyMoments(events, playerNames, 2);

    expect(moments).toHaveLength(2);
    expect(moments[0].label).toContain('Eliminated: Ada (WEREWOLF)');
    expect(moments[1].label).toContain('Night result: Ben was killed');
  });

  it('surfaces seer claims and counterclaims from public messages', () => {
    const playerNames = new Map([
      ['p1', 'Ada'],
      ['p2', 'Ben'],
    ]);

    const events = [
      {
        eventId: '1',
        at: '2024-01-01T00:00:00.000Z',
        type: 'PUBLIC_MESSAGE',
        payload: { playerId: 'p1', text: "I'm the seer", kind: 'DISCUSSION', replyToEventId: null },
      },
      {
        eventId: '2',
        at: '2024-01-01T00:00:01.000Z',
        type: 'PUBLIC_MESSAGE',
        payload: { playerId: 'p2', text: 'Counterclaim: seer here', kind: 'DISCUSSION' },
      },
    ];

    const moments = buildKeyMoments(events, playerNames, 3);

    expect(moments[0].label).toContain('Seer counterclaim: Ben');
    expect(moments[1].label).toContain('Seer claim: Ada');
  });

  it('tracks top accusations from public messages', () => {
    const playerNames = new Map([
      ['p1', 'Ada'],
      ['p2', 'Ben'],
      ['p3', 'Cy'],
    ]);

    const events = [
      {
        eventId: '1',
        at: '2024-01-01T00:00:00.000Z',
        type: 'PUBLIC_MESSAGE',
        payload: { playerId: 'p1', text: 'Ben is a wolf', kind: 'DISCUSSION' },
      },
      {
        eventId: '2',
        at: '2024-01-01T00:00:01.000Z',
        type: 'PUBLIC_MESSAGE',
        payload: { playerId: 'p3', text: 'I think Ben is wolf', kind: 'DISCUSSION' },
      },
    ];

    const moments = buildKeyMoments(events, playerNames, 4);

    expect(moments[0].label).toContain('Top accusation: Ben now has 2 accusations');
  });

  it('labels vote flips as contradictions', () => {
    const playerNames = new Map([
      ['p1', 'Ada'],
      ['p2', 'Ben'],
      ['p3', 'Cy'],
    ]);

    const events = [
      {
        eventId: '1',
        at: '2024-01-01T00:00:00.000Z',
        type: 'VOTE_CAST',
        payload: { voterPlayerId: 'p1', targetPlayerId: 'p2' },
      },
      {
        eventId: '2',
        at: '2024-01-01T00:00:01.000Z',
        type: 'VOTE_CAST',
        payload: { voterPlayerId: 'p1', targetPlayerId: 'p3' },
      },
    ];

    const moments = buildKeyMoments(events, playerNames, 2);

    expect(moments[0].label).toContain('Vote flip: Ada switched from Ben to Cy');
  });
});
