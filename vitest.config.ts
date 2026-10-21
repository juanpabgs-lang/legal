import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'contract',
          include: ['test/contract/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
