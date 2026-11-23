import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);

/** OWASP Password Storage Cheat Sheet: Argon2id, 19 MiB memory, 2 iterations, 1 lane. */
const PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;

const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** Hash a password into a self-describing PHC string: $argon2id$v=19$m=…,t=…,p=…$salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await argon2Async('argon2id', { message: password, nonce: salt, ...PARAMS });
  const params = `m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}`;
  return ['', 'argon2id', 'v=19', params, b64(salt), b64(hash)].join('$');
}

export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const match = PHC_PATTERN.exec(phc);
  if (!match) return false;
  const [, m, t, p, saltB64, hashB64] = match;
  const expected = Buffer.from(hashB64 ?? '', 'base64');
  const actual = await argon2Async('argon2id', {
    message: password,
    nonce: Buffer.from(saltB64 ?? '', 'base64'),
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
    tagLength: expected.length,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * When no account matches, still spend the same time hashing, so response times don't reveal
 * which emails have accounts.
 */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<false> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(password, await dummyHash);
  return false;
}

function b64(buf: Buffer) {
  return buf.toString('base64').replace(/=+$/, '');
}
