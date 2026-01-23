import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ai-town',
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${resolve(rootDir, 'src')}/`,
      },
      {
        find: 'convex/_generated',
        replacement: resolve(rootDir, 'convex/_generated'),
      },
    ],
  },
  server: {
    allowedHosts: ['ai-town-your-app-name.fly.dev', 'localhost', '127.0.0.1'],
  },
});
