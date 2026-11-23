import 'server-only';
import { AuthProvidersResponse } from '@fundizo/shared';
import { cache } from 'react';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** Which sign-in buttons to show (Google only when the API has credentials). Per request. */
export const getAuthProviders = cache(async (): Promise<AuthProvidersResponse> => {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/auth/providers`, { cache: 'no-store' });
    const parsed = AuthProvidersResponse.safeParse(await res.json());
    return parsed.success ? parsed.data : { google: false };
  } catch {
    return { google: false };
  }
});
