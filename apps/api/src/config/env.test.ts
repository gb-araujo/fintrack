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

  it('desliga a documentação por padrão em produção', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).API_DOCS_ENABLED).toBe(false);
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', API_DOCS_ENABLED: 'true' }).API_DOCS_ENABLED,
    ).toBe(true);
  });
});
