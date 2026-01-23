import type { Doc, Id } from '../_generated/dataModel';
import type { DatabaseReader, DatabaseWriter } from '../_generated/server';
import type { WerewolfEvent } from './engine/events';
import type { MatchPlayerState, MatchState, NightActionState } from './engine/state';
import type { MatchId } from './types';

type MatchDoc = Doc<'werewolfMatches'>;
type PlayerDoc = Doc<'werewolfPlayers'>;
type EventDoc = Doc<'werewolfEvents'>;

type MatchDocInput = Omit<MatchDoc, '_id' | '_creationTime'>;
type PlayerDocInput = Omit<PlayerDoc, '_id' | '_creationTime'>;
export type EventInsert = Omit<EventDoc, '_id' | '_creationTime'>;

export type MatchSnapshot = {
  match: MatchDoc;
  players: PlayerDoc[];
};

export async function loadMatchSnapshot(
  db: DatabaseReader,
  matchId: MatchId,
): Promise<MatchSnapshot> {
  const matchDoc = await db.get(matchId as Id<'werewolfMatches'>);
  if (!matchDoc) {
    throw new Error(`Match ${matchId} not found`);
  }
  const players = await db
    .query('werewolfPlayers')
    .withIndex('byMatchAndSeat', (q) => q.eq('matchId', matchId))
    .order('asc')
    .collect();

  return { match: matchDoc, players };
}

export function matchSnapshotToState(snapshot: MatchSnapshot): MatchState {
  return matchDocsToState(snapshot.match, snapshot.players);
}

export function matchDocsToState(match: MatchDoc, players: PlayerDoc[]): MatchState {
  const matchId = match._id as string;
  for (const player of players) {
    if (player.matchId !== matchId) {
      throw new Error(`Player ${player.playerId} does not belong to match ${matchId}`);
    }
  }

  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat);
  const playerStates = sortedPlayers.map((player) => playerDocToState(player));
  const playersAlive = playerStates.reduce((count, player) => count + (player.alive ? 1 : 0), 0);

  return {
    phase: match.phase,
    dayNumber: match.dayNumber,
    nightNumber: match.nightNumber,
    phaseStartedAt: match.phaseStartedAt,
    phaseEndsAt: match.phaseEndsAt,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    winner: match.winner,
    publicSummary: match.publicSummary,
    players: playerStates,
    playersAlive,
  };
}

function playerDocToState(player: PlayerDoc): MatchPlayerState {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    seat: player.seat,
    role: player.role,
    alive: player.alive,
    ready: player.ready,
    eliminatedAt: player.eliminatedAt,
    revealedRole: player.revealedRole,
    doctorLastProtectedPlayerId: player.doctorLastProtectedPlayerId,
    seerHistory: player.seerHistory ?? [],
    didOpeningForDay: player.didOpeningForDay,
    voteTargetPlayerId: player.voteTargetPlayerId,
    lastPublicMessageAt: player.lastPublicMessageAt,
    lastWolfChatAt: player.lastWolfChatAt,
    nightAction: player.nightAction ?? {},
  };
}

export async function writeMatchState(
  db: DatabaseWriter,
  snapshot: MatchSnapshot,
  state: MatchState,
): Promise<void> {
  const matchDoc = applyMatchStateToDoc(snapshot.match, state);
  await db.replace(snapshot.match._id, matchDoc);

  const playersById = new Map(snapshot.players.map((player) => [player.playerId, player]));
  for (const playerState of state.players) {
    const existing = playersById.get(playerState.playerId);
    if (!existing) {
      throw new Error(`Missing player ${playerState.playerId} for match ${snapshot.match._id}`);
    }
    const next = applyPlayerStateToDoc(existing, playerState);
    await db.replace(existing._id, next);
  }

  if (playersById.size !== state.players.length) {
    throw new Error(`Match ${snapshot.match._id} player count mismatch`);
  }
}

export function applyMatchStateToDoc(existing: MatchDoc, state: MatchState): MatchDocInput {
  const base = withoutSystemFields(existing);
  const next: MatchDocInput = {
    ...base,
    phase: state.phase,
    dayNumber: state.dayNumber,
    nightNumber: state.nightNumber,
    phaseStartedAt: state.phaseStartedAt,
    phaseEndsAt: state.phaseEndsAt,
    startedAt: state.startedAt,
    publicSummary: state.publicSummary,
    playersAlive: state.playersAlive,
  };

  setOptionalField(next, 'endedAt', state.endedAt);
  setOptionalField(next, 'winner', state.winner);

  return next;
}

export function applyPlayerStateToDoc(
  existing: PlayerDoc,
  state: MatchPlayerState,
): PlayerDocInput {
  if (existing.playerId !== state.playerId) {
    throw new Error(`Player ID mismatch for ${existing._id}`);
  }
  const base = withoutSystemFields(existing);
  const next: PlayerDocInput = {
    ...base,
    displayName: state.displayName,
    seat: state.seat,
    role: state.role,
    alive: state.alive,
    ready: state.ready,
    seerHistory: state.seerHistory,
  };

  setOptionalField(next, 'eliminatedAt', state.eliminatedAt);
  setOptionalField(next, 'revealedRole', state.revealedRole);
  setOptionalField(next, 'doctorLastProtectedPlayerId', state.doctorLastProtectedPlayerId);
  setOptionalField(next, 'didOpeningForDay', state.didOpeningForDay);
  setOptionalField(next, 'voteTargetPlayerId', state.voteTargetPlayerId);
  setOptionalField(next, 'lastPublicMessageAt', state.lastPublicMessageAt);
  setOptionalField(next, 'lastWolfChatAt', state.lastWolfChatAt);
  setOptionalField(next, 'nightAction', compactNightAction(state.nightAction));

  return next;
}

export async function appendMatchEvents(
  db: DatabaseWriter,
  matchId: MatchId,
  events: WerewolfEvent[],
): Promise<number[]> {
  if (events.length === 0) {
    return [];
  }
  const lastEvent = await db
    .query('werewolfEvents')
    .withIndex('byMatchAndSeq', (q) => q.eq('matchId', matchId))
    .order('desc')
    .first();
  const startingSeq = lastEvent ? lastEvent.seq + 1 : 1;
  const inserts = buildEventInserts(matchId, startingSeq, events);
  const seqs: number[] = [];
  for (const insert of inserts) {
    await db.insert('werewolfEvents', insert);
    seqs.push(insert.seq);
  }
  return seqs;
}

export function buildEventInserts(
  matchId: MatchId,
  startingSeq: number,
  events: WerewolfEvent[],
): EventInsert[] {
  return events.map((event, index) => ({
    matchId,
    seq: startingSeq + index,
    at: event.at,
    type: event.type,
    visibility: event.visibility,
    payload: event.payload,
  }));
}

function withoutSystemFields<T extends { _id: string; _creationTime: number }>(
  doc: T,
): Omit<T, '_id' | '_creationTime'> {
  const { _id: _id, _creationTime: _creationTime, ...rest } = doc;
  return rest;
}

function setOptionalField<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value === undefined) {
    delete (target as Record<string, unknown>)[key as string];
    return;
  }
  (target as Record<string, unknown>)[key as string] = value;
}

function compactNightAction(action: NightActionState): NightActionState | undefined {
  const next: NightActionState = {};
  if (action.wolfKillTargetPlayerId !== undefined) {
    next.wolfKillTargetPlayerId = action.wolfKillTargetPlayerId;
  }
  if (action.seerInspectTargetPlayerId !== undefined) {
    next.seerInspectTargetPlayerId = action.seerInspectTargetPlayerId;
  }
  if (action.doctorProtectTargetPlayerId !== undefined) {
    next.doctorProtectTargetPlayerId = action.doctorProtectTargetPlayerId;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}
