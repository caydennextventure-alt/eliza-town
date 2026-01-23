export type MatchId = string;
export type PlayerId = string;

export const ROLE_VALUES = ['VILLAGER', 'WEREWOLF', 'SEER', 'DOCTOR'] as const;
export type Role = (typeof ROLE_VALUES)[number];

const ROLE_SET: ReadonlySet<Role> = new Set(ROLE_VALUES);

export function isRole(value: string): value is Role {
  return ROLE_SET.has(value as Role);
}

export const PHASE_VALUES = [
  'LOBBY',
  'NIGHT',
  'DAY_ANNOUNCE',
  'DAY_OPENING',
  'DAY_DISCUSSION',
  'DAY_VOTE',
  'DAY_RESOLUTION',
  'ENDED',
] as const;
export type Phase = (typeof PHASE_VALUES)[number];

const PHASE_SET: ReadonlySet<Phase> = new Set(PHASE_VALUES);

export function isPhase(value: string): value is Phase {
  return PHASE_SET.has(value as Phase);
}

export const PUBLIC_MESSAGE_KINDS = ['OPENING', 'DISCUSSION', 'DEFENSE', 'LAST_WORDS'] as const;
export type PublicMessageKind = (typeof PUBLIC_MESSAGE_KINDS)[number];

const PUBLIC_MESSAGE_KIND_SET: ReadonlySet<PublicMessageKind> = new Set(PUBLIC_MESSAGE_KINDS);

export function isPublicMessageKind(value: string): value is PublicMessageKind {
  return PUBLIC_MESSAGE_KIND_SET.has(value as PublicMessageKind);
}

export const REQUIRED_ACTION_TYPES = [
  'NONE',
  'WOLF_KILL',
  'SEER_INSPECT',
  'DOCTOR_PROTECT',
  'SPEAK_OPENING',
  'SPEAK_DISCUSSION',
  'VOTE',
] as const;
export type RequiredActionType = (typeof REQUIRED_ACTION_TYPES)[number];

const REQUIRED_ACTION_TYPE_SET: ReadonlySet<RequiredActionType> = new Set(REQUIRED_ACTION_TYPES);

export function isRequiredActionType(value: string): value is RequiredActionType {
  return REQUIRED_ACTION_TYPE_SET.has(value as RequiredActionType);
}

export type RequiredAction = {
  type: RequiredActionType;
  allowedTargets: PlayerId[];
  alreadySubmitted: boolean;
};

export const COMMAND_TYPES = [
  'ADVANCE_PHASE',
  'MARK_READY',
  'SAY_PUBLIC',
  'CAST_VOTE',
  'WOLF_CHAT',
  'WOLF_KILL',
  'SEER_INSPECT',
  'DOCTOR_PROTECT',
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

const COMMAND_TYPE_SET: ReadonlySet<CommandType> = new Set(COMMAND_TYPES);

export function isCommandType(value: string): value is CommandType {
  return COMMAND_TYPE_SET.has(value as CommandType);
}

export type WerewolfCommand =
  | { type: 'ADVANCE_PHASE' }
  | { type: 'MARK_READY'; playerId: PlayerId }
  | {
      type: 'SAY_PUBLIC';
      playerId: PlayerId;
      text: string;
      kind: PublicMessageKind;
      replyToEventId?: string | null;
    }
  | { type: 'CAST_VOTE'; playerId: PlayerId; targetPlayerId: PlayerId | null; reason?: string | null }
  | { type: 'WOLF_CHAT'; playerId: PlayerId; text: string }
  | { type: 'WOLF_KILL'; playerId: PlayerId; targetPlayerId: PlayerId }
  | { type: 'SEER_INSPECT'; playerId: PlayerId; targetPlayerId: PlayerId }
  | { type: 'DOCTOR_PROTECT'; playerId: PlayerId; targetPlayerId: PlayerId };

export const EVENT_TYPES = [
  'MATCH_CREATED',
  'PHASE_CHANGED',
  'PUBLIC_MESSAGE',
  'WOLF_CHAT_MESSAGE',
  'VOTE_CAST',
  'NIGHT_RESULT',
  'PLAYER_ELIMINATED',
  'GAME_ENDED',
  'NARRATOR',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const EVENT_TYPE_SET: ReadonlySet<EventType> = new Set(EVENT_TYPES);

export function isEventType(value: string): value is EventType {
  return EVENT_TYPE_SET.has(value as EventType);
}

export const EVENT_VISIBILITY_VALUES = ['PUBLIC', 'WOLVES'] as const;
export type EventVisibilityValue = (typeof EVENT_VISIBILITY_VALUES)[number];
export type PlayerPrivateVisibility = { kind: 'PLAYER_PRIVATE'; playerId: PlayerId };
export type EventVisibility = EventVisibilityValue | PlayerPrivateVisibility;

const EVENT_VISIBILITY_SET: ReadonlySet<EventVisibilityValue> = new Set(EVENT_VISIBILITY_VALUES);

export function isEventVisibilityValue(value: string): value is EventVisibilityValue {
  return EVENT_VISIBILITY_SET.has(value as EventVisibilityValue);
}

export function isPlayerPrivateVisibility(value: unknown): value is PlayerPrivateVisibility {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as PlayerPrivateVisibility;
  return candidate.kind === 'PLAYER_PRIVATE' && typeof candidate.playerId === 'string';
}

export function isEventVisibility(value: unknown): value is EventVisibility {
  if (typeof value === 'string') {
    return isEventVisibilityValue(value);
  }
  return isPlayerPrivateVisibility(value);
}
