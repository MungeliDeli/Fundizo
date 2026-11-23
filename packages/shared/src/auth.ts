import { z } from 'zod';

/**
 * Account contracts (ADR 0004). The web forms and the API validate with these same schemas.
 * Messages are written for people, because the forms show them directly.
 */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 60;
export const EMAIL_CODE_LENGTH = 6;

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long.')
  .pipe(z.email('Enter a valid email address, like name@example.com.'));

export const Password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

const PersonName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter your ${label}.`)
    .max(NAME_MAX, `Keep your ${label} under ${NAME_MAX} characters.`);

export const EmailCode = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`), `Enter the ${EMAIL_CODE_LENGTH}-digit code.`);

export const SignupRequest = z
  .object({
    firstName: PersonName('first name'),
    lastName: PersonName('last name'),
    email: Email,
    password: Password,
  })
  .strict()
  .refine((v) => v.password.toLowerCase() !== v.email, {
    path: ['password'],
    message: 'Your password can’t be your email address.',
  });
export type SignupRequest = z.infer<typeof SignupRequest>;

export const LoginRequest = z
  .object({ email: Email, password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX) })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequest>;

export const VerifyEmailRequest = z.object({ email: Email, code: EmailCode }).strict();
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequest>;

export const EmailOnlyRequest = z.object({ email: Email }).strict();
export type EmailOnlyRequest = z.infer<typeof EmailOnlyRequest>;

export const ResetPasswordRequest = z
  .object({
    token: z.string().min(20).max(200),
    password: Password,
  })
  .strict();
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;

/** What the API returns about the signed-in user. Never includes secrets or hashes. */
export const PublicUser = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  hasPassword: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type PublicUser = z.infer<typeof PublicUser>;

export const SessionResponse = z.object({ user: PublicUser });
export type SessionResponse = z.infer<typeof SessionResponse>;

/** Neutral reply for sign-up, resend and forgot-password (no account enumeration). */
export const AcceptedResponse = z.object({ ok: z.literal(true) });
export type AcceptedResponse = z.infer<typeof AcceptedResponse>;

/** Header every state-changing request must send (CSRF defence, ADR 0004). */
export const CSRF_HEADER = 'x-fundizo-csrf';
