import type { Phase } from './types';

const parseEnvMs = (value?: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const rounded = Math.round(parsed);
  if (rounded < 0) {
    return undefined;
  }
  return rounded;
};

const readEnvMs = (name: string, fallback: number): number => {
  const parsed = parseEnvMs(process.env[name]);
  return parsed === undefined ? fallback : parsed;
};

const DEFAULT_ROUND_DURATION_MS = 15_000;
const DEFAULT_ROUND_BUFFER_MS = 5_000;
const DEFAULT_ROUND_RESPONSE_TIMEOUT_MS = 10_000;

export const ROUND_DURATION_MS = readEnvMs(
  'WEREWOLF_ROUND_DURATION_MS',
  DEFAULT_ROUND_DURATION_MS,
);
export const ROUND_BUFFER_MS = readEnvMs('WEREWOLF_ROUND_BUFFER_MS', DEFAULT_ROUND_BUFFER_MS);
const defaultResponseTimeoutMs = Math.min(
  DEFAULT_ROUND_RESPONSE_TIMEOUT_MS,
  Math.max(1_000, ROUND_DURATION_MS - ROUND_BUFFER_MS),
);
export const ROUND_RESPONSE_TIMEOUT_MS = readEnvMs(
  'WEREWOLF_ROUND_RESPONSE_TIMEOUT_MS',
  defaultResponseTimeoutMs,
);

const PHASE_ROUND_COUNTS: Record<Phase, number> = {
  LOBBY: 0,
  NIGHT: 4,
  DAY_ANNOUNCE: 0,
  DAY_OPENING: 1,
  DAY_DISCUSSION: 3,
  DAY_VOTE: 1,
  DAY_RESOLUTION: 0,
  ENDED: 0,
};

export function getRoundCount(phase: Phase): number {
  return PHASE_ROUND_COUNTS[phase] ?? 0;
}

export function getRoundStartAt(phaseStartedAt: number, roundIndex: number): number {
  return phaseStartedAt + roundIndex * ROUND_DURATION_MS;
}

export function getPreviousPhase(phase: Phase): Phase | null {
  switch (phase) {
    case 'NIGHT':
      return 'DAY_RESOLUTION';
    case 'DAY_ANNOUNCE':
      return 'NIGHT';
    case 'DAY_OPENING':
      return 'DAY_ANNOUNCE';
    case 'DAY_DISCUSSION':
      return 'DAY_OPENING';
    case 'DAY_VOTE':
      return 'DAY_DISCUSSION';
    case 'DAY_RESOLUTION':
      return 'DAY_VOTE';
    case 'LOBBY':
      return null;
    case 'ENDED':
      return 'DAY_RESOLUTION';
    default:
      return null;
  }
}
