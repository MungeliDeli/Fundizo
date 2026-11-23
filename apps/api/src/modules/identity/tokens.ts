import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** 256-bit random token for cookies and links (URL-safe). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Uniformly random 6-digit code, e.g. "042917". */
export function newEmailCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Keyed hash (HMAC-SHA256) of a secret. Only hashes are stored, and because the key lives outside
 * the database, a database leak alone can't be brute-forced back into working codes.
 */
export function hashSecret(secret: string, key: string, context = ''): string {
  return createHmac('sha256', key).update(`${context}:${secret}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
