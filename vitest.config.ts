import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['engine/**/*.test.ts', 'games/*/src/**/*.test.ts', 'server/**/*.test.ts', 'client/src/**/*.test.ts'],
  },
});
