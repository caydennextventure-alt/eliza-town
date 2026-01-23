import { createInitialMatchState } from './engine/state';
import {
  applyMatchDoctorProtect,
  applyMatchReady,
  applyMatchSayPublic,
  applyMatchSeerInspect,
  applyMatchVote,
  applyMatchWolfChat,
  applyMatchWolfKill,
  normalizePublicMessageInput,
} from './match';

const playerSeeds = Array.from({ length: 8 }, (_, index) => ({
  playerId: `p:${index + 1}`,
  displayName: `Player ${index + 1}`,
}));

const baseTime = 1_700_000_000_000;

describe('applyMatchReady', () => {
  it('marks the player ready in the lobby and emits a narrator event', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    const now = baseTime + 5_000;
    const target = state.players[0];

    const result = applyMatchReady(state, target.playerId, now);

    const updated = result.nextState.players.find((player) => player.playerId === target.playerId);
    expect(updated?.ready).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.event?.type).toBe('NARRATOR');
    if (!result.event || result.event.type !== 'NARRATOR') {
      throw new Error('Expected narrator event');
    }
    expect(result.event.payload.text).toContain(target.displayName);
  });

  it('is idempotent when the player is already ready', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.players[0].ready = true;
    const now = baseTime + 6_000;

    const result = applyMatchReady(state, state.players[0].playerId, now);

    expect(result.changed).toBe(false);
    expect(result.event).toBeUndefined();
    expect(result.nextState.players[0].ready).toBe(true);
  });
});

describe('normalizePublicMessageInput', () => {
  it('trims message text and fills defaults', () => {
    const normalized = normalizePublicMessageInput({
      text: '  Hello world  ',
      kind: 'DISCUSSION',
      replyToEventId: '42',
    });

    expect(normalized).toEqual({
      text: 'Hello world',
      kind: 'DISCUSSION',
      replyToEventId: '42',
    });
  });

  it('rejects empty messages', () => {
    expect(() => normalizePublicMessageInput({ text: '   ' })).toThrow(
      'Public message text cannot be empty.',
    );
  });

  it('rejects invalid kinds', () => {
    expect(() =>
      normalizePublicMessageInput({
        text: 'Hello',
        kind: 'NOPE',
      }),
    ).toThrow('Invalid public message kind.');
  });
});

describe('applyMatchSayPublic', () => {
  it('records the message and updates timestamps', () => {
    let state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'DAY_OPENING';
    state.dayNumber = 1;
    const speaker = state.players[0];
    const now = baseTime + 9_000;

    const result = applyMatchSayPublic(state, {
      playerId: speaker.playerId,
      text: '  Hello town ',
      kind: 'OPENING',
      replyToEventId: null,
      now,
    });

    const updated = result.nextState.players.find((player) => player.playerId === speaker.playerId);
    expect(updated?.didOpeningForDay).toBe(1);
    expect(updated?.lastPublicMessageAt).toBe(now);
    expect(result.event.type).toBe('PUBLIC_MESSAGE');
    expect(result.message).toEqual({
      playerId: speaker.playerId,
      kind: 'OPENING',
      text: 'Hello town',
    });
  });

  it('rejects messages sent too quickly', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'DAY_DISCUSSION';
    state.dayNumber = 1;
    const speaker = state.players[0];
    const now = baseTime + 9_000;
    speaker.lastPublicMessageAt = now - 1_000;

    expect(() =>
      applyMatchSayPublic(state, {
        playerId: speaker.playerId,
        text: 'Another thought',
        kind: 'DISCUSSION',
        replyToEventId: null,
        now,
      }),
    ).toThrow('Public messages are limited to one every 3 seconds.');
  });
});

describe('applyMatchVote', () => {
  it('records the vote and emits a vote cast event', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'DAY_VOTE';
    const voter = state.players[0];
    const target = state.players[1];
    const now = baseTime + 12_000;

    const result = applyMatchVote(state, {
      voterPlayerId: voter.playerId,
      targetPlayerId: target.playerId,
      reason: '  Suspicious behavior ',
      now,
    });

    const updated = result.nextState.players.find((player) => player.playerId === voter.playerId);
    expect(updated?.voteTargetPlayerId).toBe(target.playerId);
    expect(result.event.type).toBe('VOTE_CAST');
    if (result.event.type !== 'VOTE_CAST') {
      throw new Error('Expected a vote cast event');
    }
    expect(result.event.payload).toEqual({
      voterPlayerId: voter.playerId,
      targetPlayerId: target.playerId,
      reason: 'Suspicious behavior',
    });
  });
});

describe('applyMatchWolfChat', () => {
  it('records the wolf chat message and updates timestamps', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'NIGHT';
    const wolf = state.players.find((player) => player.role === 'WEREWOLF');
    if (!wolf) {
      throw new Error('Expected a werewolf in the match');
    }
    const now = baseTime + 14_000;

    const result = applyMatchWolfChat(state, {
      playerId: wolf.playerId,
      text: '  We should target seat 5  ',
      now,
    });

    const updated = result.nextState.players.find((player) => player.playerId === wolf.playerId);
    expect(updated?.lastWolfChatAt).toBe(now);
    expect(result.event.type).toBe('WOLF_CHAT_MESSAGE');
    if (result.event.type !== 'WOLF_CHAT_MESSAGE') {
      throw new Error('Expected a wolf chat message event');
    }
    expect(result.event.payload).toEqual({
      fromWolfId: wolf.playerId,
      text: 'We should target seat 5',
    });
    expect(result.message).toEqual({
      playerId: wolf.playerId,
      text: 'We should target seat 5',
    });
  });

  it('rejects wolf chat messages sent too quickly', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'NIGHT';
    const wolf = state.players.find((player) => player.role === 'WEREWOLF');
    if (!wolf) {
      throw new Error('Expected a werewolf in the match');
    }
    const now = baseTime + 14_000;
    wolf.lastWolfChatAt = now - 1_000;

    expect(() =>
      applyMatchWolfChat(state, {
        playerId: wolf.playerId,
        text: 'Too soon',
        now,
      }),
    ).toThrow('Wolf chat is limited to one message every 2 seconds.');
  });
});

describe('applyMatchWolfKill', () => {
  it('records the wolf kill target for all wolves and emits a narrator event', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'NIGHT';
    const wolves = state.players.filter((player) => player.role === 'WEREWOLF');
    expect(wolves).toHaveLength(2);
    const target = state.players.find((player) => player.role !== 'WEREWOLF');
    if (!target) {
      throw new Error('Expected a non-werewolf target');
    }
    const now = baseTime + 16_000;

    const result = applyMatchWolfKill(state, {
      playerId: wolves[0].playerId,
      targetPlayerId: target.playerId,
      now,
    });

    const updatedWolves = result.nextState.players.filter((player) => player.role === 'WEREWOLF');
    for (const wolf of updatedWolves) {
      expect(wolf.nightAction.wolfKillTargetPlayerId).toBe(target.playerId);
    }
    expect(result.event.type).toBe('NARRATOR');
    if (result.event.type !== 'NARRATOR') {
      throw new Error('Expected a narrator event');
    }
    expect(result.event.visibility).toBe('WOLVES');
    expect(result.event.payload.text).toContain(target.displayName);
    expect(result.selection).toEqual({
      byPlayerId: wolves[0].playerId,
      targetPlayerId: target.playerId,
    });
  });
});

describe('applyMatchSeerInspect', () => {
  it('records the inspection target and emits a private narrator event', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'NIGHT';
    const seer = state.players.find((player) => player.role === 'SEER');
    if (!seer) {
      throw new Error('Expected a seer in the match');
    }
    const target = state.players.find((player) => player.role === 'WEREWOLF');
    if (!target) {
      throw new Error('Expected a werewolf target');
    }
    const now = baseTime + 18_000;

    const result = applyMatchSeerInspect(state, {
      playerId: seer.playerId,
      targetPlayerId: target.playerId,
      now,
    });

    const updatedSeer = result.nextState.players.find(
      (player) => player.playerId === seer.playerId,
    );
    expect(updatedSeer?.nightAction.seerInspectTargetPlayerId).toBe(target.playerId);
    expect(result.event.type).toBe('NARRATOR');
    if (result.event.type !== 'NARRATOR') {
      throw new Error('Expected a narrator event');
    }
    expect(result.event.visibility).toEqual({ kind: 'PLAYER_PRIVATE', playerId: seer.playerId });
    expect(result.event.payload.text).toContain(target.displayName);
    expect(result.result).toEqual({
      targetPlayerId: target.playerId,
      alignment: 'WEREWOLF',
    });
  });
});

describe('applyMatchDoctorProtect', () => {
  it('records the protection target and emits a private narrator event', () => {
    const state = createInitialMatchState(playerSeeds, baseTime);
    state.phase = 'NIGHT';
    const doctor = state.players.find((player) => player.role === 'DOCTOR');
    if (!doctor) {
      throw new Error('Expected a doctor in the match');
    }
    const target = state.players.find((player) => player.playerId !== doctor.playerId);
    if (!target) {
      throw new Error('Expected a protection target');
    }
    const now = baseTime + 20_000;

    const result = applyMatchDoctorProtect(state, {
      playerId: doctor.playerId,
      targetPlayerId: target.playerId,
      now,
    });

    const updatedDoctor = result.nextState.players.find(
      (player) => player.playerId === doctor.playerId,
    );
    expect(updatedDoctor?.nightAction.doctorProtectTargetPlayerId).toBe(target.playerId);
    expect(result.event.type).toBe('NARRATOR');
    if (result.event.type !== 'NARRATOR') {
      throw new Error('Expected a narrator event');
    }
    expect(result.event.visibility).toEqual({
      kind: 'PLAYER_PRIVATE',
      playerId: doctor.playerId,
    });
    expect(result.event.payload.text).toContain(target.displayName);
    expect(result.protection).toEqual({
      byPlayerId: doctor.playerId,
      targetPlayerId: target.playerId,
    });
  });
});
