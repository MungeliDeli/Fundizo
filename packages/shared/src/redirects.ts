/**
 * Only allow same-site relative paths as a post-login destination (no open redirects).
 * Used by the web app (login `next`) and the API (Google sign-in `next`).
 */
export function safeNextPath(next: unknown, fallback = '/account'): string {
  if (typeof next !== 'string' || next.length > 512) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
