import { ApiErrorBody, CSRF_HEADER, type ErrorCode } from '@fundizo/shared';
import type { z } from 'zod';

/**
 * Browser-side API client. Calls go to /api/* on this site (proxied to the API by Next), every
 * state change carries the CSRF header, and every response is validated with the shared schema.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'network_error' | 'bad_response',
    message: string,
    readonly status: number | null,
    readonly fields: Record<string, string> = {},
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

interface Options extends RequestInit {
  /** Non-2xx statuses that still carry a valid body for `schema` (e.g. 503 from /health). */
  acceptStatuses?: number[];
}

export function apiGet<S extends z.ZodType>(path: string, schema: S, init?: Options) {
  return request(path, schema, { ...init, method: 'GET' });
}

export function apiPost<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  init?: Options,
) {
  return send('POST', path, body, schema, init);
}

export function apiPatch<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  init?: Options,
) {
  return send('PATCH', path, body, schema, init);
}

/** State changes always carry JSON and the CSRF header (ADR 0004). */
function send<S extends z.ZodType>(
  method: 'POST' | 'PATCH',
  path: string,
  body: unknown,
  schema: S,
  init?: Options,
) {
  return request(path, schema, {
    ...init,
    method,
    body: JSON.stringify(body ?? {}),
    headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: '1', ...init?.headers },
  });
}

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init: Options,
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(
      'network_error',
      'We couldn’t reach Fundizo. Check your connection and try again.',
      null,
    );
  }
  const json: unknown = res.status === 204 ? {} : await res.json().catch(() => null);
  if (!res.ok && !init.acceptStatuses?.includes(res.status)) {
    const parsed = ApiErrorBody.safeParse(json);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiError(e.code, e.message, res.status, e.fields ?? {}, e.retryAfter);
    }
    throw new ApiError('bad_response', 'Something went wrong. Please try again.', res.status);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new ApiError('bad_response', 'Something went wrong. Please try again.', res.status);
  return parsed.data;
}

/** Field errors from a Zod safeParse, keyed by top-level field (first message wins). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    out[key] ??= issue.message;
  }
  return out;
}
