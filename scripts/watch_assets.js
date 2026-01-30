import chokidar from 'chokidar';
import path from 'path';
import { fileURLToPath } from 'url';
import { updateAssets } from './update_assets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSET_DIR = path.join(__dirname, '../public/assets/Tileset Asset');
const WATCH_EXTENSIONS = new Set(['.png']);

let debounceTimer = null;
let running = false;
let pending = false;

const scheduleRefresh = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runRefresh();
  }, 300);
};

const runRefresh = async () => {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    await updateAssets();
  } catch (error) {
    console.error('[assets] Refresh failed:', error);
  } finally {
    running = false;
    if (pending) {
      pending = false;
      scheduleRefresh();
    }
  }
};

console.log(`[assets] Watching ${path.relative(process.cwd(), ASSET_DIR)} for changes...`);
console.log('[assets] Press Ctrl+C to stop.');

const watcher = chokidar.watch(ASSET_DIR, {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 50,
  },
});

watcher.on('all', (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!WATCH_EXTENSIONS.has(ext)) return;
  console.log(`[assets] ${event}: ${path.relative(process.cwd(), filePath)}`);
  scheduleRefresh();
});

const shutdown = async () => {
  try {
    await watcher.close();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

