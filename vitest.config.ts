import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['_api/**/*.test.ts'],
    environment: 'node',
  },
});
