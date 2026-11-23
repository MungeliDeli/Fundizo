import type { z } from 'zod';

/**
 * Browser-side API client. Calls go to /api/* on this site (proxied to the API by Next), and
 * every response is validated with the shared Zod schema before the UI trusts it.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: RequestInit & { acceptStatuses?: number[] },
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('Network error', null);
  }
  const accepted = res.ok || init?.acceptStatuses?.includes(res.status);
  if (!accepted) throw new ApiError(`Request failed with ${res.status}`, res.status);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiError('Unexpected response from the server', res.status);
  return parsed.data;
}
