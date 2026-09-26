import { vi } from 'vitest';
import { buildApp } from '../app.js';
import { parseEnv, type AppConfig } from '../config/env.js';
import type { DatabaseConnection, DrizzleDb } from '../db/client.js';

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://fintrack:fintrack@localhost:5432/fintrack_test',
    CORS_ORIGINS: 'http://localhost:5173',
    API_DOCS_ENABLED: 'false',
    ...overrides,
  });
}

/** Banco falso para testes que não precisam de PostgreSQL. */
export function fakeDatabase(ping: () => Promise<void> = () => Promise.resolve()) {
  return {
    db: {} as DrizzleDb,
    ping: vi.fn(ping),
    close: vi.fn(() => Promise.resolve()),
  } satisfies DatabaseConnection;
}

export async function buildTestApp(
  options: { env?: Record<string, string>; database?: DatabaseConnection } = {},
) {
  return buildApp({
    config: testConfig(options.env),
    database: options.database ?? fakeDatabase(),
  });
}
