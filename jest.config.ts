import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
  preset: 'ts-jest/presets/default-esm',
  testPathIgnorePatterns: ['<rootDir>/e2e/', '<rootDir>/vendor/'],
  modulePathIgnorePatterns: ['<rootDir>/vendor/'],
};
export default jestConfig;
