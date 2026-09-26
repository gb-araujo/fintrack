import { z } from 'zod';

const booleanFromEnv = z.stringbool({ truthy: ['true', '1', 'yes'], falsy: ['false', '0', 'no'] });

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

  DATABASE_URL: z
    .string({ error: 'DATABASE_URL é obrigatório' })
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL deve ser uma URL postgres://'),
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
});

export type AppConfig = Omit<z.infer<typeof envSchema>, 'API_DOCS_ENABLED'> & {
  API_DOCS_ENABLED: boolean;
};

export class InvalidEnvironmentError extends Error {
  constructor(readonly issues: string[]) {
    super(`Variáveis de ambiente inválidas:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Mostra apenas o nome da variável e o problema — nunca o valor (pode conter credenciais).
    throw new InvalidEnvironmentError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const env = result.data;
  return {
    ...env,
    API_DOCS_ENABLED: env.API_DOCS_ENABLED ?? env.NODE_ENV !== 'production',
  };
}
