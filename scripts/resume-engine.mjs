import { spawnSync } from 'node:child_process';

const timeoutMs = Number(process.env.CONVEX_RESUME_TIMEOUT_MS ?? '15000');
const intervalMs = Number(process.env.CONVEX_RESUME_INTERVAL_MS ?? '500');
const deadline = Date.now() + timeoutMs;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isBackendNotRunning = (output) =>
  output.includes("Local backend isn't running") ||
  output.includes('Local backend is not running');

if (process.env.SKIP_CONVEX_RESUME) {
  process.exit(0);
}

const tryResumeOnce = () => {
  const result = spawnSync('npx', ['convex', 'run', 'testing:resume'], {
    stdio: 'pipe',
  });
  if (result.status === 0) {
    if (result.stdout?.length) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr?.length) {
      process.stderr.write(result.stderr);
    }
    return true;
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
};

let warned = false;
while (true) {
  if (tryResumeOnce()) {
    process.exit(0);
  }
  if (Date.now() >= deadline) {
    console.error('Timed out waiting for local Convex backend to resume engine.');
    process.exit(1);
  }
  if (!warned) {
    console.log('Waiting for local Convex backend to resume engine...');
    warned = true;
  }
  await sleep(intervalMs);
}
