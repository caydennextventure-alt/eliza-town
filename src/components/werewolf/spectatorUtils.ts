export type SpectatorEvent = {
  eventId: string;
  at: string;
  type: string;
  payload: Record<string, unknown>;
};

export type SpectatorPlayer = {
  playerId: string;
  displayName: string;
  alive: boolean;
};

export type VoteTallyEntry = {
  targetPlayerId: string | null;
  targetLabel: string;
  count: number;
  voters: string[];
};

export type KeyMoment = {
  eventId: string;
  at: string;
  label: string;
};

export type Countdown = {
  remainingSeconds: number;
  label: string;
  isExpired: boolean;
};

type NameEntry = {
  playerId: string;
  name: string;
  matchRegex: RegExp;
};

type KeyMomentContext = {
  accusationCounts: Map<string, number>;
  topAccusationCount: number;
  lastVoteByVoter: Map<string, string | null>;
};

const UNKNOWN_TIME_LABEL = '--:--';
const SEER_REGEX = /\bseer\b/;
const SEER_CLAIM_REGEX = /\b(i am|i'm|im|i claim|claiming|claim)\b/;
const SEER_COUNTER_REGEX = /\b(counterclaim|counter-claim|counter claim|cc)\b/;
const ACCUSATION_REGEX = /\b(wolf|werewolf|sus|suspicious|liar|lying)\b/;
const DEFENSE_REGEX = /\b(innocent|clear)\b/;
const NOT_WOLF_REGEX = /\bnot\s+(a\s+)?wolf\b|\bis\s+not\s+(a\s+)?wolf\b|\bisn't\s+(a\s+)?wolf\b/;

export function formatCountdown(phaseEndsAtIso: string, nowMs: number): Countdown {
  const endMs = Date.parse(phaseEndsAtIso);
  if (!Number.isFinite(endMs)) {
    return { remainingSeconds: 0, label: UNKNOWN_TIME_LABEL, isExpired: true };
  }
  const diffMs = endMs - nowMs;
  const remainingSeconds = Math.max(0, Math.ceil(diffMs / 1000));
  return {
    remainingSeconds,
    label: formatDuration(remainingSeconds),
    isExpired: diffMs <= 0,
  };
}

export function buildVoteTally(
  events: SpectatorEvent[],
  players: SpectatorPlayer[],
): VoteTallyEntry[] {
  const alivePlayers = new Set(players.filter((player) => player.alive).map((player) => player.playerId));
  const playerNameById = new Map(players.map((player) => [player.playerId, player.displayName]));
  const latestVotes = new Map<string, string | null>();
  let lastDayVoteIndex = -1;

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.type !== 'PHASE_CHANGED') {
      continue;
    }
    const payload = asRecord(event.payload);
    const toPhase = typeof payload?.to === 'string' ? payload.to : null;
    if (toPhase === 'DAY_VOTE') {
      lastDayVoteIndex = i;
    }
  }

  for (let i = 0; i < events.length; i += 1) {
    if (i <= lastDayVoteIndex) {
      continue;
    }
    const event = events[i];
    if (event.type !== 'VOTE_CAST') {
      continue;
    }
    const payload = asRecord(event.payload);
    const voterPlayerId = typeof payload?.voterPlayerId === 'string' ? payload.voterPlayerId : null;
    if (!voterPlayerId || !alivePlayers.has(voterPlayerId)) {
      continue;
    }
    const targetField = payload?.targetPlayerId;
    const targetPlayerId = typeof targetField === 'string' ? targetField : targetField === null ? null : null;
    latestVotes.set(voterPlayerId, targetPlayerId);
  }

  const tallies = new Map<string | null, { count: number; voters: string[] }>();
  for (const [voterId, targetId] of latestVotes) {
    const entry = tallies.get(targetId) ?? { count: 0, voters: [] };
    entry.count += 1;
    entry.voters.push(playerNameById.get(voterId) ?? voterId);
    tallies.set(targetId, entry);
  }

  const results: VoteTallyEntry[] = [];
  for (const [targetId, entry] of tallies) {
    results.push({
      targetPlayerId: targetId,
      targetLabel: targetId ? playerNameById.get(targetId) ?? targetId : 'Abstain',
      count: entry.count,
      voters: entry.voters,
    });
  }

  results.sort((a, b) => {
    const countDiff = b.count - a.count;
    if (countDiff !== 0) {
      return countDiff;
    }
    return a.targetLabel.localeCompare(b.targetLabel);
  });

  return results;
}

export function buildKeyMoments(
  events: SpectatorEvent[],
  playerNameById: Map<string, string>,
  maxItems = 5,
): KeyMoment[] {
  const moments: KeyMoment[] = [];
  const nameEntries = buildNameEntries(playerNameById);
  const context: KeyMomentContext = {
    accusationCounts: new Map(),
    topAccusationCount: 0,
    lastVoteByVoter: new Map(),
  };

  for (const event of events) {
    const payload = asRecord(event.payload);
    const label = formatKeyMomentLabel(event.type, payload, playerNameById, nameEntries, context);
    if (!label) {
      continue;
    }
    moments.push({ eventId: event.eventId, at: event.at, label });
  }

  if (moments.length <= maxItems) {
    return moments.slice().reverse();
  }

  return moments.slice(-maxItems).reverse();
}

function formatDuration(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatKeyMomentLabel(
  type: string,
  payload: Record<string, unknown> | null,
  playerNameById: Map<string, string>,
  nameEntries: NameEntry[],
  context: KeyMomentContext,
): string | null {
  const data = payload ?? {};
  switch (type) {
    case 'PUBLIC_MESSAGE': {
      const playerId = typeof data.playerId === 'string' ? data.playerId : null;
      const text = typeof data.text === 'string' ? data.text : null;
      if (!playerId || !text) {
        return null;
      }
      const speakerName = playerNameById.get(playerId) ?? playerId;
      const normalizedText = normalizeText(text);
      const seerMoment = getSeerMoment(normalizedText, speakerName);
      if (seerMoment) {
        return seerMoment;
      }
      return getAccusationMoment(normalizedText, playerId, nameEntries, context);
    }
    case 'VOTE_CAST': {
      const voterPlayerId = typeof data.voterPlayerId === 'string' ? data.voterPlayerId : null;
      const targetField = data.targetPlayerId;
      if (!voterPlayerId) {
        return null;
      }
      const voterName = playerNameById.get(voterPlayerId) ?? voterPlayerId;
      const targetPlayerId = typeof targetField === 'string' ? targetField : null;
      const targetName = targetPlayerId ? playerNameById.get(targetPlayerId) ?? targetPlayerId : 'Abstain';
      const previousTarget = context.lastVoteByVoter.get(voterPlayerId);
      context.lastVoteByVoter.set(voterPlayerId, targetPlayerId ?? null);
      if (previousTarget !== undefined && previousTarget !== targetPlayerId) {
        const previousName = previousTarget ? playerNameById.get(previousTarget) ?? previousTarget : 'Abstain';
        return `Vote flip: ${voterName} switched from ${previousName} to ${targetName}`;
      }
      if (!targetPlayerId) {
        return `Vote: ${voterName} abstained`;
      }
      return `Vote: ${voterName} -> ${targetName}`;
    }
    case 'NIGHT_RESULT': {
      const killedPlayerId = typeof data.killedPlayerId === 'string' ? data.killedPlayerId : null;
      const savedByDoctor = data.savedByDoctor === true;
      if (killedPlayerId) {
        const killedName = playerNameById.get(killedPlayerId) ?? killedPlayerId;
        return `Night result: ${killedName} was killed`;
      }
      return savedByDoctor
        ? 'Night result: no one died (doctor saved)'
        : 'Night result: no one died';
    }
    case 'PLAYER_ELIMINATED': {
      const playerId = typeof data.playerId === 'string' ? data.playerId : null;
      const role = typeof data.roleRevealed === 'string' ? data.roleRevealed : null;
      if (!playerId || !role) {
        return null;
      }
      const playerName = playerNameById.get(playerId) ?? playerId;
      return `Eliminated: ${playerName} (${role})`;
    }
    case 'GAME_ENDED': {
      const winningTeam = typeof data.winningTeam === 'string' ? data.winningTeam : null;
      if (!winningTeam) {
        return null;
      }
      return `Game ended: ${winningTeam} win`;
    }
    default:
      return null;
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function buildNameEntries(playerNameById: Map<string, string>): NameEntry[] {
  const entries: NameEntry[] = [];
  for (const [playerId, name] of playerNameById) {
    const trimmed = name.trim();
    if (!trimmed) {
      continue;
    }
    const escaped = escapeRegex(trimmed.toLowerCase());
    if (!escaped) {
      continue;
    }
    entries.push({
      playerId,
      name: trimmed,
      matchRegex: new RegExp(`\\b${escaped}\\b`),
    });
  }
  return entries;
}

function findMentionedPlayer(
  textLower: string,
  nameEntries: NameEntry[],
  excludePlayerId: string,
): { playerId: string; name: string } | null {
  let best: { playerId: string; name: string; index: number } | null = null;
  for (const entry of nameEntries) {
    if (entry.playerId === excludePlayerId) {
      continue;
    }
    const match = entry.matchRegex.exec(textLower);
    if (!match) {
      continue;
    }
    if (!best || match.index < best.index) {
      best = { playerId: entry.playerId, name: entry.name, index: match.index };
    }
  }
  return best ? { playerId: best.playerId, name: best.name } : null;
}

function getSeerMoment(textLower: string, speakerName: string): string | null {
  if (!SEER_REGEX.test(textLower)) {
    return null;
  }
  if (SEER_COUNTER_REGEX.test(textLower)) {
    return `Seer counterclaim: ${speakerName} disputes the seer claim.`;
  }
  if (SEER_CLAIM_REGEX.test(textLower)) {
    return `Seer claim: ${speakerName} claims seer.`;
  }
  return null;
}

function getAccusationMoment(
  textLower: string,
  speakerId: string,
  nameEntries: NameEntry[],
  context: KeyMomentContext,
): string | null {
  if (!ACCUSATION_REGEX.test(textLower)) {
    return null;
  }
  if (DEFENSE_REGEX.test(textLower) || NOT_WOLF_REGEX.test(textLower)) {
    return null;
  }
  const target = findMentionedPlayer(textLower, nameEntries, speakerId);
  if (!target) {
    return null;
  }
  const nextCount = (context.accusationCounts.get(target.playerId) ?? 0) + 1;
  context.accusationCounts.set(target.playerId, nextCount);
  if (nextCount >= context.topAccusationCount) {
    context.topAccusationCount = Math.max(context.topAccusationCount, nextCount);
    const countLabel = nextCount === 1 ? 'accusation' : 'accusations';
    return `Top accusation: ${target.name} now has ${nextCount} ${countLabel}.`;
  }
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}
