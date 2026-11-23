import 'server-only';
import { type PublicUser, SessionResponse } from '@fundizo/shared';
import { cookies } from 'next/headers';
import { cache } from 'react';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
export const SESSION_COOKIE = 'fz_session';

/**
 * The signed-in user for this request (server components only), or null. Asks the API, forwarding
 * only the session cookie. Cached per request, so the header and the page share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_INTERNAL_URL}/auth/me`, {
      headers: {
        cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const parsed = SessionResponse.safeParse(await res.json());
    return parsed.success ? parsed.data.user : null;
  } catch {
    return null;
  }
});
