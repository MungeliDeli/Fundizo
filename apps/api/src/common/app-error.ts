import type { ErrorCode } from '@fundizo/shared';

/** A failure we expect and explain to the client. Anything else becomes a 500 with no details. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly extra: { fields?: Record<string, string>; retryAfter?: number } = {},
  ) {
    super(message);
  }
}

export const Errors = {
  invalidCredentials: () =>
    new AppError('invalid_credentials', 401, 'Email or password is incorrect.'),
  emailNotVerified: () =>
    new AppError(
      'email_not_verified',
      403,
      'Please confirm your email first. We sent you a new code.',
    ),
  invalidCode: () =>
    new AppError('invalid_code', 400, 'That code isn’t right. Check the email and try again.'),
  codeExpired: () => new AppError('code_expired', 400, 'That code has expired. Ask for a new one.'),
  tooManyAttempts: () =>
    new AppError(
      'too_many_attempts',
      429,
      'Too many wrong codes. Ask for a new code and try again.',
    ),
  invalidToken: () =>
    new AppError(
      'invalid_token',
      400,
      'This link has expired or was already used. Ask for a new one.',
    ),
  unauthenticated: () => new AppError('unauthenticated', 401, 'Please log in.'),
  notFound: () => new AppError('not_found', 404, 'Not found.'),
  notPublishable: (fields: Record<string, string>) =>
    new AppError('not_publishable', 422, 'A few things are still needed before publishing.', {
      fields,
    }),
  phoneInUse: () =>
    new AppError(
      'phone_in_use',
      409,
      'That number is already confirmed on another Fundizo account.',
    ),
  smsFailed: () =>
    new AppError(
      'sms_failed',
      503,
      'We couldn’t send the text message just now. Please try again in a few minutes.',
    ),
  validation: (fields: Record<string, string>) =>
    new AppError('validation_failed', 400, 'Please check the highlighted fields.', { fields }),
  idempotencyConflict: () =>
    new AppError(
      'idempotency_conflict',
      409,
      'This request was already used for something different. Please reload and try again.',
    ),
  rateLimited: (retryAfter: number) =>
    new AppError('rate_limited', 429, 'Too many tries. Please wait a moment and try again.', {
      retryAfter,
    }),
};
