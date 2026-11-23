import { z } from 'zod';

export const DependencyStatus = z.enum(['up', 'down']);
export type DependencyStatus = z.infer<typeof DependencyStatus>;

/** Response of `GET /health`. */
export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  time: z.iso.datetime(),
  checks: z.object({
    database: DependencyStatus,
    redis: DependencyStatus,
  }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
