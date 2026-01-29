import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cloudPort = process.env.E2E_CONVEX_PORT ?? '3212';
const sitePort = process.env.E2E_CONVEX_SITE_PORT ?? '3213';

const findCachedBackendVersion = () => {
  if (process.env.CONVEX_FORCE_LATEST) {
    return null;
  }
  const override = process.env.CONVEX_LOCAL_BACKEND_VERSION;
  if (override) {
    return override;
  }
  const binariesDir = path.join(os.homedir(), '.cache', 'convex', 'binaries');
  if (!fs.existsSync(binariesDir)) {
    return null;
  }
  const entries = fs
    .readdirSync(binariesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  const candidates = entries
    .map((entry) => {
      const binaryPath = path.join(binariesDir, entry.name, 'convex-local-backend');
      if (!fs.existsSync(binaryPath)) {
        return null;
      }
      const stats = fs.statSync(binaryPath);
      return { name: entry.name, mtimeMs: stats.mtimeMs };
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.name ?? null;
};

const cachedBackendVersion = findCachedBackendVersion();

const convexArgs = [
  'convex',
  'dev',
  '--run',
  'init',
  '--local',
  '--local-cloud-port',
  cloudPort,
  '--local-site-port',
  sitePort,
  '--tail-logs',
];
if (cachedBackendVersion) {
  convexArgs.push('--local-backend-version', cachedBackendVersion);
}

const mergedEnv = {
  ...process.env,
  CONVEX_AGENT_MODE: process.env.CONVEX_AGENT_MODE ?? 'anonymous',
  ELIZA_API_DEBUG: process.env.ELIZA_API_DEBUG ?? '0',
  E2E_ELIZA_DEBUG: process.env.E2E_ELIZA_DEBUG ?? '0',
  ELIZA_DISABLE_LEGACY: process.env.ELIZA_DISABLE_LEGACY ?? '1',
  ELIZA_POLL_ONLY: process.env.ELIZA_POLL_ONLY ?? '1',
  ELIZA_POLL_ONLY_ALLOW_SSE: process.env.ELIZA_POLL_ONLY_ALLOW_SSE ?? '0',
  WEREWOLF_ELIZA_CONCURRENCY: process.env.WEREWOLF_ELIZA_CONCURRENCY ?? '2',
  WEREWOLF_ROUND_DURATION_MS: process.env.WEREWOLF_ROUND_DURATION_MS ?? '1500',
  WEREWOLF_ROUND_BUFFER_MS: process.env.WEREWOLF_ROUND_BUFFER_MS ?? '200',
  WEREWOLF_ROUND_RESPONSE_TIMEOUT_MS:
    process.env.WEREWOLF_ROUND_RESPONSE_TIMEOUT_MS ?? '1000',
  AITOWN_DISABLE_AGENT_OPERATIONS:
    process.env.AITOWN_DISABLE_AGENT_OPERATIONS ?? '1',
  AITOWN_NOISY_LOGS: process.env.AITOWN_NOISY_LOGS ?? '0',
};

const convex = spawn('npx', convexArgs, {
  env: mergedEnv,
  stdio: ['inherit', 'pipe', 'pipe'],
});

const READY_PATTERN = /Convex functions ready/i;
let outputBuffer = '';
let sidecarsStarted = false;
let sync = null;
let resume = null;

const startSidecars = () => {
  if (sidecarsStarted) {
    return;
  }
  sidecarsStarted = true;

  sync = spawn('node', ['scripts/sync-convex-env.mjs'], {
    stdio: 'inherit',
    env: mergedEnv,
  });

  sync.on('exit', (code) => {
    if (code && code !== 0) {
      convex.kill('SIGTERM');
      process.exit(code);
    }
  });

  resume = spawn('node', ['scripts/resume-engine.mjs'], {
    stdio: 'inherit',
    env: mergedEnv,
  });

  resume.on('exit', (code) => {
    if (code && code !== 0) {
      convex.kill('SIGTERM');
      process.exit(code);
    }
  });
};

const handleOutput = (chunk, stream) => {
  stream.write(chunk);
  if (sidecarsStarted) {
    return;
  }
  outputBuffer += chunk.toString();
  if (READY_PATTERN.test(outputBuffer)) {
    startSidecars();
    return;
  }
  if (outputBuffer.length > 2000) {
    outputBuffer = outputBuffer.slice(-2000);
  }
};

convex.stdout.on('data', (chunk) => handleOutput(chunk, process.stdout));
convex.stderr.on('data', (chunk) => handleOutput(chunk, process.stderr));

const forwardSignal = (signal) => {
  convex.kill(signal);
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

convex.on('exit', (code) => {
  if (sync) {
    sync.kill('SIGTERM');
  }
  if (resume) {
    resume.kill('SIGTERM');
  }
  process.exit(code ?? 0);
});
