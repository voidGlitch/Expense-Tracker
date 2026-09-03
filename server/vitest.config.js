import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    env: {
      NODE_ENV: 'test',
      STORAGE_DRIVER: 'memory',
      // Real bcrypt, lowest supported cost — keeps the suite quick.
      BCRYPT_ROUNDS: '10',
      JWT_SECRET: 'test-secret-that-is-long-enough-to-be-valid-0123456789',
    },
    reporters: ['default'],
  },
});
