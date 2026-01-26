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

const env = {
  ...process.env,
  VITE_E2E: process.env.VITE_E2E ?? '1',
  VITE_CONVEX_URL:
    process.env.VITE_CONVEX_URL ?? `http://${host}:${cloudPort}`,
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
