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

const isE2EFast = () => /^(1|true|yes)$/i.test(process.env.WEREWOLF_E2E_FAST ?? '');

const getDefaultRoundDurationMs = () => (isE2EFast() ? 1_500 : 15_000);
const getDefaultRoundBufferMs = () => (isE2EFast() ? 200 : 5_000);
const getDefaultRoundResponseTimeoutMs = () => (isE2EFast() ? 1_000 : 10_000);

export const getRoundDurationMs = () =>
  readEnvMs('WEREWOLF_ROUND_DURATION_MS', getDefaultRoundDurationMs());

export const getRoundBufferMs = () =>
  readEnvMs('WEREWOLF_ROUND_BUFFER_MS', getDefaultRoundBufferMs());

export const getRoundResponseTimeoutMs = () => {
  const roundDuration = getRoundDurationMs();
  const roundBuffer = getRoundBufferMs();
  const defaultResponseTimeoutMs = Math.min(
    getDefaultRoundResponseTimeoutMs(),
    Math.max(1_000, roundDuration - roundBuffer),
  );
  return readEnvMs('WEREWOLF_ROUND_RESPONSE_TIMEOUT_MS', defaultResponseTimeoutMs);
};

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
  return phaseStartedAt + roundIndex * getRoundDurationMs();
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
