import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Testes de integração com PostgreSQL rodam somente quando TEST_DATABASE_URL está definido.
    testTimeout: 15_000,
  },
});
