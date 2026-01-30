import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const host = process.env.E2E_CONVEX_HOST ?? '127.0.0.1';
const cloudPort = Number(process.env.E2E_CONVEX_PORT ?? '3212');
const vitePort = process.env.E2E_VITE_PORT ?? '4173';
const timeoutMs = Number(process.env.E2E_CONVEX_WAIT_TIMEOUT_MS ?? '60000');
const intervalMs = Number(process.env.E2E_CONVEX_WAIT_INTERVAL_MS ?? '250');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const canConnect = (port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });

const waitForBackend = async () => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnect(cloudPort)) {
      return;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `Timed out waiting for Convex backend at ${host}:${cloudPort} after ${timeoutMs}ms.`,
  );
};

if (!process.env.SKIP_CONVEX_WAIT) {
  console.log(`Waiting for Convex backend on ${host}:${cloudPort}...`);
  await waitForBackend();
}

const defaultAgentNames = Array.from({ length: 8 }, (_, index) => `E2E Werewolf ${index + 1}`);
const defaultAgentIds = [
  'c7cab9c8-6c71-03a6-bd21-a694c8776023',
  '5f72a139-5879-0f35-9da7-90bf5be30be7',
  '63951950-3c9b-0ca8-8308-cab08cbb464f',
  '811e5045-23aa-06eb-9897-30584a587d46',
  '918dcdba-01af-0c4c-9867-3c0f114264f6',
  '998c8655-d945-0fa3-b5df-cef9bb7fae48',
  'd09c5b1c-9cce-0e90-9b2b-b3364191369a',
  '23337d73-4500-01b6-9eb0-7d9bbd3ea4cc',
];
const defaultAgentMap = Object.fromEntries(
  defaultAgentNames.map((name, index) => [name, defaultAgentIds[index]]),
);

const env = {
  ...process.env,
  VITE_E2E: process.env.VITE_E2E ?? '1',
  VITE_CONVEX_URL:
    process.env.VITE_CONVEX_URL ?? `http://${host}:${cloudPort}`,
  VITE_E2E_ELIZA_AGENT_MAP:
    process.env.VITE_E2E_ELIZA_AGENT_MAP ??
    process.env.E2E_ELIZA_AGENT_MAP ??
    JSON.stringify(defaultAgentMap),
  VITE_E2E_ELIZA_AGENT_NAMES:
    process.env.VITE_E2E_ELIZA_AGENT_NAMES ??
    process.env.E2E_ELIZA_AGENT_NAMES ??
    defaultAgentNames.join(','),
  VITE_E2E_ELIZA_AGENT_IDS:
    process.env.VITE_E2E_ELIZA_AGENT_IDS ??
    process.env.E2E_ELIZA_AGENT_IDS ??
    defaultAgentIds.join(','),
};

const viteBin = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const viteArgs = ['--mode', 'e2e', '--port', vitePort, '--strictPort'];
const child = fs.existsSync(viteBin)
  ? spawn(process.execPath, [viteBin, ...viteArgs], { stdio: 'inherit', env })
  : spawn('npx', ['vite', ...viteArgs], { stdio: 'inherit', env });

const forwardSignal = (signal) => {
  child.kill(signal);
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
