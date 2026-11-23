import type { Env } from '../../config/env.js';

/** Session cookie (ADR 0004). */
export { SESSION_COOKIE } from './sessions.service.js';
/** Binds a Google sign-in to the browser that started it; lives 10 minutes. */
export const OAUTH_STATE_COOKIE = 'fz_oauth';

export function cookieOptions(env: Env) {
  return { httpOnly: true, secure: env.SESSION_COOKIE_SECURE, sameSite: 'lax' as const, path: '/' };
}
