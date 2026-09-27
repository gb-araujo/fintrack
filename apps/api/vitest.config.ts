import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Testes de integração com PostgreSQL rodam somente quando TEST_DATABASE_URL está definido;
    // o global setup aplica as migrations nesse banco antes da suíte.
    globalSetup: ['./src/test/global-setup.ts'],
    testTimeout: 15_000,
  },
});
