import type { EventVisibility, Phase, PlayerId, PublicMessageKind, Role } from '../types';
import type { WinningTeam } from './state';

export type MatchCreatedPlayer = {
  playerId: PlayerId;
  displayName: string;
  seat: number;
};

export type MatchCreatedPayload = {
  players: MatchCreatedPlayer[];
  phaseEndsAt: number;
};

export type PhaseChangedPayload = {
  from: Phase;
  to: Phase;
  dayNumber: number;
  phaseEndsAt: number;
};

export type PublicMessagePayload = {
  playerId: PlayerId;
  text: string;
  kind: PublicMessageKind;
  replyToEventId: string | null;
};

export type WolfChatMessagePayload = {
  fromWolfId: PlayerId;
  text: string;
};

export type VoteCastPayload = {
  voterPlayerId: PlayerId;
  targetPlayerId: PlayerId | null;
  reason: string | null;
};

export type NightResultPayload = {
  killedPlayerId: PlayerId | null;
  savedByDoctor: boolean;
};

export type PlayerEliminatedPayload = {
  playerId: PlayerId;
  roleRevealed: Role;
};

export type GameEndedPayload = {
  winningTeam: WinningTeam;
};

export type NarratorPayload = {
  text: string;
};

export type EventPayloadByType = {
  MATCH_CREATED: MatchCreatedPayload;
  PHASE_CHANGED: PhaseChangedPayload;
  PUBLIC_MESSAGE: PublicMessagePayload;
  WOLF_CHAT_MESSAGE: WolfChatMessagePayload;
  VOTE_CAST: VoteCastPayload;
  NIGHT_RESULT: NightResultPayload;
  PLAYER_ELIMINATED: PlayerEliminatedPayload;
  GAME_ENDED: GameEndedPayload;
  NARRATOR: NarratorPayload;
};

export type MatchCreatedEvent = {
  type: 'MATCH_CREATED';
  visibility: 'PUBLIC';
  at: number;
  payload: MatchCreatedPayload;
};

export type PhaseChangedEvent = {
  type: 'PHASE_CHANGED';
  visibility: 'PUBLIC';
  at: number;
  payload: PhaseChangedPayload;
};

export type PublicMessageEvent = {
  type: 'PUBLIC_MESSAGE';
  visibility: 'PUBLIC';
  at: number;
  payload: PublicMessagePayload;
};

export type WolfChatMessageEvent = {
  type: 'WOLF_CHAT_MESSAGE';
  visibility: 'WOLVES';
  at: number;
  payload: WolfChatMessagePayload;
};

export type VoteCastEvent = {
  type: 'VOTE_CAST';
  visibility: 'PUBLIC';
  at: number;
  payload: VoteCastPayload;
};

export type NightResultEvent = {
  type: 'NIGHT_RESULT';
  visibility: 'PUBLIC';
  at: number;
  payload: NightResultPayload;
};

export type PlayerEliminatedEvent = {
  type: 'PLAYER_ELIMINATED';
  visibility: 'PUBLIC';
  at: number;
  payload: PlayerEliminatedPayload;
};

export type GameEndedEvent = {
  type: 'GAME_ENDED';
  visibility: 'PUBLIC';
  at: number;
  payload: GameEndedPayload;
};

export type NarratorEvent = {
  type: 'NARRATOR';
  visibility: EventVisibility;
  at: number;
  payload: NarratorPayload;
};

export type WerewolfEvent =
  | MatchCreatedEvent
  | PhaseChangedEvent
  | PublicMessageEvent
  | WolfChatMessageEvent
  | VoteCastEvent
  | NightResultEvent
  | PlayerEliminatedEvent
  | GameEndedEvent
  | NarratorEvent;

export function createMatchCreatedEvent(params: {
  at: number;
  players: MatchCreatedPlayer[];
  phaseEndsAt: number;
}): MatchCreatedEvent {
  return {
    type: 'MATCH_CREATED',
    visibility: 'PUBLIC',
    at: params.at,
    payload: {
      players: params.players,
      phaseEndsAt: params.phaseEndsAt,
    },
  };
}

export function createPhaseChangedEvent(params: {
  at: number;
  from: Phase;
  to: Phase;
  dayNumber: number;
  phaseEndsAt: number;
}): PhaseChangedEvent {
  return {
    type: 'PHASE_CHANGED',
    visibility: 'PUBLIC',
    at: params.at,
    payload: {
      from: params.from,
      to: params.to,
      dayNumber: params.dayNumber,
      phaseEndsAt: params.phaseEndsAt,
    },
  };
}

export function createPublicMessageEvent(params: {
  at: number;
  playerId: PlayerId;
  text: string;
  kind: PublicMessageKind;
  replyToEventId?: string | null;
}): PublicMessageEvent {
  return {
    type: 'PUBLIC_MESSAGE',
    visibility: 'PUBLIC',
    at: params.at,
    payload: {
      playerId: params.playerId,
      text: params.text,
      kind: params.kind,
      replyToEventId: params.replyToEventId ?? null,
    },
  };
}

export function createWolfChatMessageEvent(params: {
  at: number;
  fromWolfId: PlayerId;
  text: string;
}): WolfChatMessageEvent {
  return {
    type: 'WOLF_CHAT_MESSAGE',
    visibility: 'WOLVES',
    at: params.at,
    payload: {
      fromWolfId: params.fromWolfId,
      text: params.text,
    },
  };
}

export function createVoteCastEvent(params: {
  at: number;
  voterPlayerId: PlayerId;
  targetPlayerId: PlayerId | null;
  reason?: string | null;
}): VoteCastEvent {
  return {
    type: 'VOTE_CAST',
    visibility: 'PUBLIC',
    at: params.at,
    payload: {
      voterPlayerId: params.voterPlayerId,
      targetPlayerId: params.targetPlayerId,
      reason: params.reason ?? null,
    },
  };
}

export function createNightResultEvent(params: {
  at: number;
  wolfKillTargetPlayerId?: PlayerId;
  eliminatedPlayerId?: PlayerId;
}): NightResultEvent {
  const savedByDoctor = Boolean(params.wolfKillTargetPlayerId && !params.eliminatedPlayerId);

  return {
    type: 'NIGHT_RESULT',
    visibility: 'PUBLIC',
    at: params.at,
    payload: {
      killedPlayerId: params.eliminatedPlayerId ?? null,
      savedByDoctor,
    },
  };
}

export function createPlayerEliminatedEvent(params: {
  at: number;
  playerId: PlayerId;
  roleRevealed: Role;
}): PlayerEliminatedEvent {
  return {
    type: 'PLAYER_ELIMINATED',
    visibility: 'PUBLIC',
    at: params.at,
    payload: {
      playerId: params.playerId,
      roleRevealed: params.roleRevealed,
    },
  };
}

export function createGameEndedEvent(params: { at: number; winningTeam: WinningTeam }): GameEndedEvent {
  return {
    type: 'GAME_ENDED',
    visibility: 'PUBLIC',
    at: params.at,
    payload: {
      winningTeam: params.winningTeam,
    },
  };
}

export function createNarratorEvent(params: {
  at: number;
  text: string;
  visibility?: EventVisibility;
}): NarratorEvent {
  return {
    type: 'NARRATOR',
    visibility: params.visibility ?? 'PUBLIC',
    at: params.at,
    payload: {
      text: params.text,
    },
  };
}
