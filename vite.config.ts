import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useMocks =
    process.env.VITE_E2E_MOCKS === 'true' ||
    process.env.VITE_E2E_MOCKS === '1' ||
    env.VITE_E2E_MOCKS === 'true' ||
    env.VITE_E2E_MOCKS === '1';

  const alias = {
    'convex/_generated/api': useMocks
      ? path.resolve(__dirname, 'src/mocks/convexApi.ts')
      : path.resolve(__dirname, 'convex/_generated/api'),
    ...(useMocks
      ? { 'convex/react': path.resolve(__dirname, 'src/mocks/convexReact.tsx') }
      : {}),
  };

  return {
    base: '/ai-town',
    plugins: [react()],
    resolve: {
      alias,
    },
    server: {
      allowedHosts: ['ai-town-your-app-name.fly.dev', 'localhost', '127.0.0.1'],
    },
  };
});
