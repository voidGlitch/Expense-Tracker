import { defineConfig } from 'vitest/config';

// Engine tests are pure functions (SRS §12) — no DOM, no plugins, no jsdom.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    reporters: ['default'],
  },
});
