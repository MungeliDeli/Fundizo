/** Only allow same-site relative paths after login (no open redirects). */
export function safeNextPath(next: string | string[] | undefined, fallback = '/account'): string {
  const value = typeof next === 'string' ? next : undefined;
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return fallback;
  return value;
}
