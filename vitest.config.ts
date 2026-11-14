import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // DOM-dependent test files opt in with `// @vitest-environment jsdom`.
  },
});
