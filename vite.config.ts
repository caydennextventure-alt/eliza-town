import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ai-town',
  plugins: [react()],
  server: {
    allowedHosts: ['ai-town-your-app-name.fly.dev', 'localhost', '127.0.0.1'],
    watch: {
      // Ignore the eliza monorepo to prevent ELOOP errors from circular symlinks
      ignored: ['**/eliza/**', '**/node_modules/**'],
    },
  },
  // Exclude eliza monorepo from processing
  optimizeDeps: {
    exclude: ['@elizaos/core', '@elizaos/plugin-sql', '@elizaos/plugin-localdb'],
    entries: [
      'src/**/*.{ts,tsx}',
      'index.html',
    ],
  },
  build: {
    rollupOptions: {
      external: [/^@elizaos\/.*/],
    },
  },
  // Exclude the eliza subdirectory from being scanned
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
