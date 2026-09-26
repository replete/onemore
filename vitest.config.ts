import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['engine/**/*.test.ts', 'games/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
