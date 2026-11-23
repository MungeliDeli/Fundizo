import { z } from 'zod';

/** Machine-readable error codes. The UI maps codes to words; it never shows raw server text. */
export const ErrorCode = z.enum([
  'validation_failed',
  'invalid_credentials',
  'email_not_verified',
  'invalid_code',
  'code_expired',
  'too_many_attempts',
  'rate_limited',
  'invalid_token',
  'unauthenticated',
  'csrf_failed',
  'phone_in_use',
  'sms_failed',
  'not_publishable',
  'bad_image',
  'too_many_photos',
  'not_found',
  'internal_error',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    /** Field-level problems, keyed by field name. */
    fields: z.record(z.string(), z.string()).optional(),
    /** Seconds until a rate limit resets. */
    retryAfter: z.number().int().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
