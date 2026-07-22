import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['packages/*/src/**/*.{ts,tsx}'],
      reporter: ['text', 'html'],
    },
    include: ['packages/**/*.test.ts'],
  },
});
