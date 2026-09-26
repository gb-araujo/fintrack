import { z } from 'zod';

export const healthStatusSchema = z.enum(['ok', 'degraded']);
export const dependencyStatusSchema = z.enum(['ok', 'error']);

/** Resposta de GET /health — consumida por Web, Android e pelo healthcheck do Railway. */
export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  version: z.string(),
  uptimeSeconds: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
  checks: z.object({
    database: dependencyStatusSchema,
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
