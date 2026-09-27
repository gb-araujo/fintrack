import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, parseEnv } from './env.js';

const base = { DATABASE_URL: 'postgres://user:secret@localhost:5432/fintrack' };

describe('parseEnv', () => {
  it('aplica valores padrão seguros', () => {
    const config = parseEnv(base);
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3333,
      CORS_ORIGINS: ['http://localhost:5173'],
      TRUST_PROXY: false,
      API_DOCS_ENABLED: true,
    });
  });

  it('falha sem DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(InvalidEnvironmentError);
  });

  it('rejeita DATABASE_URL que não é PostgreSQL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('nunca expõe o valor das variáveis na mensagem de erro', () => {
    try {
      parseEnv({ DATABASE_URL: 'mysql://user:super-secret-password@host/db' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-password');
    }
  });

  it('interpreta lista de origens CORS e booleanos', () => {
    const config = parseEnv({
      ...base,
      CORS_ORIGINS: 'https://app.fintrack.dev, http://localhost:5173',
      TRUST_PROXY: 'true',
      PORT: '8080',
    });
    expect(config.CORS_ORIGINS).toEqual(['https://app.fintrack.dev', 'http://localhost:5173']);
    expect(config.TRUST_PROXY).toBe(true);
    expect(config.PORT).toBe(8080);
  });

  it('rejeita origem CORS inválida', () => {
    expect(() => parseEnv({ ...base, CORS_ORIGINS: 'not a url' })).toThrow(/CORS_ORIGINS/);
  });

  it('JWT_SECRET é obrigatório em produção', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('variáveis vazias no .env contam como ausentes (usam o padrão)', () => {
    const config = parseEnv({ ...base, JWT_SECRET: '', PORT: '', API_DOCS_ENABLED: ' ' });
    expect(config.JWT_SECRET_EPHEMERAL).toBe(true);
    expect(config.PORT).toBe(3333);
    expect(config.API_DOCS_ENABLED).toBe(true);
    expect(() => parseEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('rejeita JWT_SECRET curto', () => {
    expect(() => parseEnv({ ...base, JWT_SECRET: 'curto' })).toThrow(/JWT_SECRET/);
  });

  it('fora de produção, sem JWT_SECRET, gera um segredo temporário aleatório', () => {
    const first = parseEnv(base);
    const second = parseEnv(base);
    expect(first.JWT_SECRET_EPHEMERAL).toBe(true);
    expect(first.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(first.JWT_SECRET).not.toBe(second.JWT_SECRET);
  });

  it('cookie Secure ligado por padrão só em produção', () => {
    const secret = { JWT_SECRET: 'x'.repeat(32) };
    expect(parseEnv({ ...base, ...secret }).AUTH_COOKIE_SECURE).toBe(false);
    expect(parseEnv({ ...base, ...secret, NODE_ENV: 'production' }).AUTH_COOKIE_SECURE).toBe(true);
  });

  it('desliga a documentação por padrão em produção', () => {
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) }).API_DOCS_ENABLED,
    ).toBe(false);
    expect(
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        API_DOCS_ENABLED: 'true',
        JWT_SECRET: 'x'.repeat(32),
      }).API_DOCS_ENABLED,
    ).toBe(true);
  });
});
