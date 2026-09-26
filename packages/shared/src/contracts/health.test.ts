import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('valida a resposta de /health', () => {
    const parsed = healthResponseSchema.safeParse({
      status: 'ok',
      version: '0.0.0',
      uptimeSeconds: 12,
      timestamp: new Date().toISOString(),
      checks: { database: 'ok' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejeita status desconhecido', () => {
    const parsed = healthResponseSchema.safeParse({
      status: 'maybe',
      version: '0.0.0',
      uptimeSeconds: 1,
      timestamp: new Date().toISOString(),
      checks: { database: 'ok' },
    });
    expect(parsed.success).toBe(false);
  });
});
