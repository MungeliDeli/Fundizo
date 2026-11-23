import 'server-only';
import { cookies } from 'next/headers';
import type { z } from 'zod';
import { SESSION_COOKIE } from './session';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/**
 * Server components reading from the API. Forwards only the session cookie. Returns null on 404
 * (so pages can call notFound()), and throws on anything unexpected.
 */
export async function serverGet<S extends z.ZodType>(
  path: string,
  schema: S,
  opts: { auth?: boolean } = {},
): Promise<z.infer<S> | null> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.auth !== false) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
  }
  const res = await fetch(`${API_INTERNAL_URL}${path}`, { headers, cache: 'no-store' });
  if (res.status === 404 || res.status === 400 || res.status === 401) return null;
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return schema.parse(await res.json());
}
