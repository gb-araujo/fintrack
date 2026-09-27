import { describe, expect, it } from 'vitest';
import { evaluateRefreshToken, ROTATION_GRACE_MS } from './refresh-token-policy.js';

const now = new Date('2026-09-26T12:00:00Z');
const future = new Date('2026-10-26T12:00:00Z');

describe('evaluateRefreshToken', () => {
  it('token ativo e dentro da validade é válido', () => {
    expect(
      evaluateRefreshToken({ expiresAt: future, revokedAt: null, replacedById: null }, now),
    ).toBe('valid');
  });

  it('token expirado', () => {
    expect(evaluateRefreshToken({ expiresAt: now, revokedAt: null, replacedById: null }, now)).toBe(
      'expired',
    );
  });

  it('token revogado por logout (sem substituto)', () => {
    expect(
      evaluateRefreshToken({ expiresAt: future, revokedAt: now, replacedById: null }, now),
    ).toBe('revoked');
  });

  it('token recém-rotacionado reapresentado dentro da janela = concorrência (race)', () => {
    const revokedAt = new Date(now.getTime() - ROTATION_GRACE_MS);
    expect(evaluateRefreshToken({ expiresAt: future, revokedAt, replacedById: 'x' }, now)).toBe(
      'race',
    );
  });

  it('token rotacionado reapresentado após a janela = reuso (possível roubo)', () => {
    const revokedAt = new Date(now.getTime() - ROTATION_GRACE_MS - 1);
    expect(evaluateRefreshToken({ expiresAt: future, revokedAt, replacedById: 'x' }, now)).toBe(
      'reused',
    );
  });

  it('reuso tem prioridade sobre expiração', () => {
    const revokedAt = new Date(now.getTime() - 60 * 60 * 1000);
    expect(
      evaluateRefreshToken({ expiresAt: new Date(0), revokedAt, replacedById: 'x' }, now),
    ).toBe('reused');
  });
});
