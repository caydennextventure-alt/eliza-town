import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/tests/e2e/**/*.e2e.test.ts'],
  testTimeout: 300000, // 5 minutes for real LLM calls
  setupFilesAfterEnv: ['<rootDir>/tests/e2e/setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  // Ignore the eliza subdirectory to avoid module collision
  modulePathIgnorePatterns: ['<rootDir>/eliza/'],
  testPathIgnorePatterns: ['/node_modules/', '/eliza/'],
};

export default jestConfig;
