import { spawnSync } from 'node:child_process';

const envKeys = [
  'WEREWOLF_LOG_EVENTS',
  'WEREWOLF_LOG_PRIVATE',
  'AITOWN_NOISY_LOGS',
  'LLM_LOGS',
  'ELIZA_API_DEBUG',
  'ELIZA_API_DEBUG_VERBOSE',
  'ELIZA_API_DEBUG_CURL',
  'E2E_ELIZA_DEBUG',
  'ELIZA_DISABLE_LEGACY',
  'ELIZA_MESSAGING_ONLY',
  'ELIZA_POLL_ONLY',
  'ELIZA_POLL_ONLY_ALLOW_SSE',
  'WEREWOLF_ELIZA_CONCURRENCY',
  'WEREWOLF_E2E_FAST',
  'WEREWOLF_ROUND_DURATION_MS',
  'WEREWOLF_ROUND_BUFFER_MS',
  'WEREWOLF_ROUND_RESPONSE_TIMEOUT_MS',
  'WEREWOLF_PHASE_MS_LOBBY',
  'WEREWOLF_PHASE_MS_NIGHT',
  'WEREWOLF_PHASE_MS_DAY_ANNOUNCE',
  'WEREWOLF_PHASE_MS_DAY_OPENING',
  'WEREWOLF_PHASE_MS_DAY_DISCUSSION',
  'WEREWOLF_PHASE_MS_DAY_VOTE',
  'WEREWOLF_PHASE_MS_DAY_RESOLUTION',
  'WEREWOLF_PHASE_MS_ENDED',
  'AITOWN_DISABLE_AGENT_OPERATIONS',
  // Dev UX: allow unauthenticated editing/room ownership via guestKey.
  'ALLOW_UNAUTHENTICATED_TOWN_EDIT',
];
const envValues = envKeys
  .map((key) => ({ key, value: process.env[key] }))
  .filter((entry) => entry.value !== undefined);

if (envValues.length === 0) {
  process.exit(0);
}

const timeoutMs = Number(process.env.CONVEX_ENV_SYNC_TIMEOUT_MS ?? '15000');
const intervalMs = Number(process.env.CONVEX_ENV_SYNC_INTERVAL_MS ?? '500');
const deadline = Date.now() + timeoutMs;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isBackendNotRunning = (output) =>
  output.includes("Local backend isn't running") ||
  output.includes('Local backend is not running');

const trySyncOnce = () => {
  for (const { key, value } of envValues) {
    const result = spawnSync('npx', ['convex', 'env', 'set', `${key}=${value}`], {
      stdio: 'pipe',
    });
    if (result.status === 0) {
      continue;
    }
    const stdout = result.stdout?.toString() ?? '';
    const stderr = result.stderr?.toString() ?? '';
    const output = stdout + stderr;
    if (isBackendNotRunning(output)) {
      return false;
    }
    if (output) {
      process.stderr.write(output);
    }
    process.exit(result.status ?? 1);
  }
  return true;
};

let warned = false;
while (true) {
  if (trySyncOnce()) {
    process.exit(0);
  }
  if (Date.now() >= deadline) {
    console.error('Timed out waiting for local Convex backend to sync env variables.');
    process.exit(1);
  }
  if (!warned) {
    console.log('Waiting for local Convex backend to accept env settings...');
    warned = true;
  }
  await sleep(intervalMs);
}
