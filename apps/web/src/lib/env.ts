import { z } from 'zod';

const envSchema = z.object({
  /** URL base da API. Vazio = mesma origem (proxy do Vite em dev). */
  VITE_API_URL: z
    .union([z.literal(''), z.url()])
    .default('')
    .transform((url) => url.replace(/\/+$/, '')),
});

export const env = envSchema.parse(import.meta.env);
