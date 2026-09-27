import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const booleanFromEnv = z.stringbool({ truthy: ['true', '1', 'yes'], falsy: ['false', '0', 'no'] });

const databaseUrlSchema = z
  .string({ error: 'DATABASE_URL é obrigatório' })
  .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL deve ser uma URL postgres://');

/** Mínimo de 32 caracteres (≈ 256 bits se gerado como sugerido no .env.example). */
const JWT_SECRET_MIN_LENGTH = 32;

/**
 * Configuração validada no boot. Se algo estiver errado a API NÃO sobe.
 * Credenciais (DATABASE_URL, JWT_SECRET…) vêm SOMENTE do ambiente — nunca do código.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_VERSION: z.string().min(1).default('0.0.0'),

  DATABASE_URL: databaseUrlSchema,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  /** Origens permitidas no CORS, separadas por vírgula. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),

  /** true atrás de proxy reverso (Railway), para obter o IP real do cliente no rate limit. */
  TRUST_PROXY: booleanFromEnv.default(false),
  /** Documentação OpenAPI em /docs. Desligada por padrão em produção. */
  API_DOCS_ENABLED: booleanFromEnv.optional(),

  /** Segredo de assinatura dos access tokens (HS256). Obrigatório em produção. */
  JWT_SECRET: z
    .string()
    .min(
      JWT_SECRET_MIN_LENGTH,
      `JWT_SECRET deve ter pelo menos ${JWT_SECRET_MIN_LENGTH} caracteres`,
    )
    .optional(),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** Cookie de refresh com atributo Secure. Padrão: ligado em produção. */
  AUTH_COOKIE_SECURE: booleanFromEnv.optional(),
});

export type AppConfig = Omit<
  z.infer<typeof envSchema>,
  'API_DOCS_ENABLED' | 'JWT_SECRET' | 'AUTH_COOKIE_SECURE'
> & {
  API_DOCS_ENABLED: boolean;
  JWT_SECRET: string;
  AUTH_COOKIE_SECURE: boolean;
  /** true quando o JWT_SECRET foi gerado na inicialização (apenas fora de produção). */
  JWT_SECRET_EPHEMERAL: boolean;
};

export class InvalidEnvironmentError extends Error {
  constructor(readonly issues: string[]) {
    super(`Variáveis de ambiente inválidas:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

/** Variáveis vazias (ex.: `JWT_SECRET=` no .env) contam como ausentes: usam o padrão. */
function withoutEmptyValues(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value?.trim() !== ''));
}

function formatIssues(error: z.ZodError): string[] {
  // Mostra apenas o nome da variável e o problema — nunca o valor (pode conter credenciais).
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(withoutEmptyValues(source));
  if (!result.success) throw new InvalidEnvironmentError(formatIssues(result.error));

  const env = result.data;
  const isProduction = env.NODE_ENV === 'production';

  if (!env.JWT_SECRET && isProduction) {
    throw new InvalidEnvironmentError(['JWT_SECRET: obrigatório em produção']);
  }

  return {
    ...env,
    API_DOCS_ENABLED: env.API_DOCS_ENABLED ?? !isProduction,
    AUTH_COOKIE_SECURE: env.AUTH_COOKIE_SECURE ?? isProduction,
    // Fora de produção, sem JWT_SECRET, gera um segredo aleatório por execução:
    // funciona, mas as sessões não sobrevivem a um restart da API.
    JWT_SECRET: env.JWT_SECRET ?? randomBytes(48).toString('base64url'),
    JWT_SECRET_EPHEMERAL: !env.JWT_SECRET,
  };
}

/** Configuração mínima para scripts de banco (migrations/seeds): só precisam do DATABASE_URL. */
export function parseDatabaseEnv(source: NodeJS.ProcessEnv = process.env) {
  const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: databaseUrlSchema,
  });
  const result = schema.safeParse(withoutEmptyValues(source));
  if (!result.success) throw new InvalidEnvironmentError(formatIssues(result.error));
  return result.data;
}
