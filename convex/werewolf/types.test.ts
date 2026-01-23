import {
  COMMAND_TYPES,
  EVENT_TYPES,
  EVENT_VISIBILITY_VALUES,
  PHASE_VALUES,
  PUBLIC_MESSAGE_KINDS,
  REQUIRED_ACTION_TYPES,
  ROLE_VALUES,
  isCommandType,
  isEventType,
  isEventVisibility,
  isEventVisibilityValue,
  isPhase,
  isPublicMessageKind,
  isRequiredActionType,
  isRole,
} from './types';

describe('ROLE_VALUES', () => {
  it('lists all roles in the game', () => {
    expect(ROLE_VALUES).toEqual(['VILLAGER', 'WEREWOLF', 'SEER', 'DOCTOR']);
    expect(new Set(ROLE_VALUES).size).toBe(ROLE_VALUES.length);
  });

  it('validates roles', () => {
    for (const role of ROLE_VALUES) {
      expect(isRole(role)).toBe(true);
    }
    expect(isRole('ALIEN')).toBe(false);
  });
});

describe('PHASE_VALUES', () => {
  it('lists all match phases', () => {
    expect(PHASE_VALUES).toEqual([
      'LOBBY',
      'NIGHT',
      'DAY_ANNOUNCE',
      'DAY_OPENING',
      'DAY_DISCUSSION',
      'DAY_VOTE',
      'DAY_RESOLUTION',
      'ENDED',
    ]);
    expect(new Set(PHASE_VALUES).size).toBe(PHASE_VALUES.length);
  });

  it('validates phases', () => {
    for (const phase of PHASE_VALUES) {
      expect(isPhase(phase)).toBe(true);
    }
    expect(isPhase('MIDNIGHT')).toBe(false);
  });
});

describe('PUBLIC_MESSAGE_KINDS', () => {
  it('lists all public message kinds', () => {
    expect(PUBLIC_MESSAGE_KINDS).toEqual(['OPENING', 'DISCUSSION', 'DEFENSE', 'LAST_WORDS']);
    expect(new Set(PUBLIC_MESSAGE_KINDS).size).toBe(PUBLIC_MESSAGE_KINDS.length);
  });

  it('validates public message kinds', () => {
    for (const kind of PUBLIC_MESSAGE_KINDS) {
      expect(isPublicMessageKind(kind)).toBe(true);
    }
    expect(isPublicMessageKind('VOTE')).toBe(false);
  });
});

describe('REQUIRED_ACTION_TYPES', () => {
  it('lists all required action types', () => {
    expect(REQUIRED_ACTION_TYPES).toEqual([
      'NONE',
      'WOLF_KILL',
      'SEER_INSPECT',
      'DOCTOR_PROTECT',
      'SPEAK_OPENING',
      'SPEAK_DISCUSSION',
      'VOTE',
    ]);
    expect(new Set(REQUIRED_ACTION_TYPES).size).toBe(REQUIRED_ACTION_TYPES.length);
  });

  it('validates required action types', () => {
    for (const action of REQUIRED_ACTION_TYPES) {
      expect(isRequiredActionType(action)).toBe(true);
    }
    expect(isRequiredActionType('READY')).toBe(false);
  });
});

describe('COMMAND_TYPES', () => {
  it('lists all command types', () => {
    expect(COMMAND_TYPES).toEqual([
      'ADVANCE_PHASE',
      'MARK_READY',
      'SAY_PUBLIC',
      'CAST_VOTE',
      'WOLF_CHAT',
      'WOLF_KILL',
      'SEER_INSPECT',
      'DOCTOR_PROTECT',
    ]);
    expect(new Set(COMMAND_TYPES).size).toBe(COMMAND_TYPES.length);
  });

  it('validates command types', () => {
    for (const command of COMMAND_TYPES) {
      expect(isCommandType(command)).toBe(true);
    }
    expect(isCommandType('ELIMINATE')).toBe(false);
  });
});

describe('EVENT_TYPES', () => {
  it('lists all event types', () => {
    expect(EVENT_TYPES).toEqual([
      'MATCH_CREATED',
      'PHASE_CHANGED',
      'PUBLIC_MESSAGE',
      'WOLF_CHAT_MESSAGE',
      'VOTE_CAST',
      'NIGHT_RESULT',
      'PLAYER_ELIMINATED',
      'GAME_ENDED',
      'NARRATOR',
    ]);
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
  });

  it('validates event types', () => {
    for (const event of EVENT_TYPES) {
      expect(isEventType(event)).toBe(true);
    }
    expect(isEventType('PHASE_CHANGE')).toBe(false);
  });
});

describe('event visibility', () => {
  it('lists all visibility values', () => {
    expect(EVENT_VISIBILITY_VALUES).toEqual(['PUBLIC', 'WOLVES']);
    expect(new Set(EVENT_VISIBILITY_VALUES).size).toBe(EVENT_VISIBILITY_VALUES.length);
  });

  it('validates visibility strings', () => {
    for (const visibility of EVENT_VISIBILITY_VALUES) {
      expect(isEventVisibilityValue(visibility)).toBe(true);
    }
    expect(isEventVisibilityValue('PRIVATE')).toBe(false);
  });

  it('validates full visibility objects', () => {
    expect(isEventVisibility('PUBLIC')).toBe(true);
    expect(isEventVisibility('WOLVES')).toBe(true);
    expect(isEventVisibility({ kind: 'PLAYER_PRIVATE', playerId: 'p:1' })).toBe(true);
    expect(isEventVisibility({ kind: 'PLAYER_PRIVATE' })).toBe(false);
  });
});
