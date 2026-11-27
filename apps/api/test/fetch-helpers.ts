import { z } from 'zod';

/** Typed views of what a mocked `fetch` was called with (tests only). */
const JsonBody = z.record(z.string(), z.unknown());
const Section = z.record(z.string(), z.unknown());

export function urlOf(input: string | URL | Request | undefined): string {
  if (input === undefined) return '';
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

export function jsonBodyOf(init: RequestInit | undefined): Record<string, unknown> {
  const raw = typeof init?.body === 'string' ? init.body : '{}';
  return JsonBody.parse(JSON.parse(raw));
}

/** A nested object in a JSON body, e.g. ZynlePay's `auth` or `data`. */
export function sectionOf(body: Record<string, unknown>, key: string): Record<string, unknown> {
  return Section.parse(body[key] ?? {});
}
