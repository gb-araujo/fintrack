import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
/** Limite superior evita abuso de CPU no hash (argon2) com senhas gigantes. */
export const PASSWORD_MAX_LENGTH = 128;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const emailSchema = z
  .string({ error: 'Informe o e-mail.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'E-mail inválido.' }).max(254, { error: 'E-mail muito longo.' }));

export const newPasswordSchema = z
  .string({ error: 'Informe a senha.' })
  .min(PASSWORD_MIN_LENGTH, {
    error: `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
  });

export const nameSchema = z
  .string({ error: 'Informe o nome.' })
  .trim()
  .min(1, { error: 'Informe o nome.' })
  .max(100, { error: 'Nome muito longo.' });

export const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isValidTimeZone, { error: 'Fuso horário inválido.' });

export const registerRequestSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
  /** Fuso do dispositivo (ex.: Intl.DateTimeFormat().resolvedOptions().timeZone). */
  timezone: timeZoneSchema.optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  // No login não se aplica a regra de tamanho mínimo: apenas limites de segurança.
  password: z
    .string({ error: 'Informe a senha.' })
    .min(1, { error: 'Informe a senha.' })
    .max(PASSWORD_MAX_LENGTH, { error: 'Senha inválida.' }),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Android envia o refresh token no corpo; a Web usa o cookie httpOnly (corpo vazio). */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1).max(512).optional(),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  timezone: z.string(),
  currency: z.string().length(3),
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  /** Presente apenas para clientes nativos (header `X-Client: android`). */
  refreshToken: z.string().optional(),
  refreshTokenExpiresAt: z.iso.datetime().optional(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const AUTH_CLIENT_HEADER = 'x-client';

/**
 * Motivo informado em `error.details.reason` quando o refresh falha porque outra requisição
 * (ex.: outra aba) acabou de rotacionar o mesmo token. O cliente pode tentar de novo.
 */
export const REFRESH_RACE_REASON = 'concurrent_rotation';
export const NATIVE_CLIENTS = ['android'] as const;
