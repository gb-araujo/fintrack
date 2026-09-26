import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('retorna ok quando o banco responde', async () => {
    const times = [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:01:30Z')];
    const service = new HealthService(
      { ping: () => Promise.resolve() },
      { version: '1.0.0', now: () => times.shift() ?? new Date('2026-01-01T00:01:30Z') },
    );

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      version: '1.0.0',
      uptimeSeconds: 90,
      timestamp: '2026-01-01T00:01:30.000Z',
      checks: { database: 'ok' },
    });
  });

  it('retorna degraded quando o banco falha', async () => {
    const service = new HealthService(
      { ping: () => Promise.reject(new Error('connection refused')) },
      { version: '1.0.0' },
    );

    await expect(service.check()).resolves.toMatchObject({
      status: 'degraded',
      checks: { database: 'error' },
    });
  });

  it('retorna degraded quando o banco não responde dentro do timeout', async () => {
    const service = new HealthService(
      { ping: () => new Promise<void>(() => undefined) },
      { version: '1.0.0', databaseTimeoutMs: 20 },
    );

    await expect(service.check()).resolves.toMatchObject({ checks: { database: 'error' } });
  });
});
