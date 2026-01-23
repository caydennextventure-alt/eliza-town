import type { PlayerId, WerewolfCommand } from '../types';
import type { MatchPlayerState, MatchState } from './state';

export type DayActionCommand = Extract<WerewolfCommand, { type: 'SAY_PUBLIC' | 'CAST_VOTE' }>;

export type DayVoteResolution = {
  nextState: MatchState;
  eliminatedPlayerId?: PlayerId;
};

export function applyDayAction(state: MatchState, command: DayActionCommand): MatchState {
  switch (command.type) {
    case 'SAY_PUBLIC':
      return applyPublicMessage(state, command);
    case 'CAST_VOTE':
      return applyVote(state, command);
    default: {
      const _exhaustive: never = command;
      return state;
    }
  }
}

export function resolveDayVote(state: MatchState, now: number): DayVoteResolution {
  assertVotePhase(state, 'Vote resolution');

  const alivePlayers = state.players.filter((player) => player.alive);
  const aliveById = new Map(alivePlayers.map((player) => [player.playerId, player]));
  const voteCounts = new Map<PlayerId, number>();

  for (const voter of alivePlayers) {
    const targetId = voter.voteTargetPlayerId;
    if (targetId === undefined || targetId === null) {
      continue;
    }

    const target = aliveById.get(targetId);
    if (!target) {
      throw new Error(`Vote target ${targetId} is not alive`);
    }

    voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
  }

  let eliminatedPlayerId: PlayerId | undefined;
  if (voteCounts.size > 0) {
    let maxVotes = 0;
    let leaders: PlayerId[] = [];

    for (const [targetId, count] of voteCounts.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        leaders = [targetId];
      } else if (count === maxVotes) {
        leaders.push(targetId);
      }
    }

    if (maxVotes > 0 && leaders.length === 1) {
      eliminatedPlayerId = leaders[0];
    }
  }

  const nextPlayers = state.players.map((player) => {
    const next: MatchPlayerState = { ...player, voteTargetPlayerId: undefined };
    if (player.playerId === eliminatedPlayerId) {
      next.alive = false;
      next.eliminatedAt = now;
      next.revealedRole = true;
    }
    return next;
  });

  const playersAlive = nextPlayers.filter((player) => player.alive).length;

  return {
    nextState: {
      ...state,
      players: nextPlayers,
      playersAlive,
    },
    eliminatedPlayerId,
  };
}

function applyPublicMessage(
  state: MatchState,
  command: Extract<DayActionCommand, { type: 'SAY_PUBLIC' }>,
): MatchState {
  assertPublicMessagePhase(state, 'Public messages');

  const actor = findPlayer(state, command.playerId);
  if (!actor.alive) {
    throw new Error('Dead players cannot speak publicly');
  }

  if (state.phase === 'DAY_OPENING' && actor.didOpeningForDay === state.dayNumber) {
    throw new Error('Opening statement already submitted for this day');
  }

  const nextPlayers = state.players.map((player) => {
    if (player.playerId !== actor.playerId) {
      return player;
    }
    if (state.phase !== 'DAY_OPENING') {
      return player;
    }
    return {
      ...player,
      didOpeningForDay: state.dayNumber,
    };
  });

  return { ...state, players: nextPlayers };
}

function applyVote(
  state: MatchState,
  command: Extract<DayActionCommand, { type: 'CAST_VOTE' }>,
): MatchState {
  assertVotePhase(state, 'Voting');

  const actor = findPlayer(state, command.playerId);
  if (!actor.alive) {
    throw new Error('Dead players cannot vote');
  }

  if (command.targetPlayerId !== null) {
    const target = findPlayer(state, command.targetPlayerId);
    if (!target.alive) {
      throw new Error('Vote target must be alive');
    }
  }

  const nextPlayers = state.players.map((player) => {
    if (player.playerId !== actor.playerId) {
      return player;
    }
    return {
      ...player,
      voteTargetPlayerId: command.targetPlayerId,
    };
  });

  return { ...state, players: nextPlayers };
}

function assertPublicMessagePhase(state: MatchState, action: string): void {
  if (state.phase !== 'DAY_OPENING' && state.phase !== 'DAY_DISCUSSION') {
    throw new Error(`${action} can only be handled during DAY_OPENING or DAY_DISCUSSION`);
  }
}

function assertVotePhase(state: MatchState, action: string): void {
  if (state.phase !== 'DAY_VOTE') {
    throw new Error(`${action} can only be handled during DAY_VOTE`);
  }
}

function findPlayer(state: MatchState, playerId: PlayerId): MatchPlayerState {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) {
    throw new Error(`Unknown player ${playerId}`);
  }
  return player;
}
