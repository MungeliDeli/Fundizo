import { describe, expect, it } from 'vitest';
import { safeNextPath } from './redirects.js';

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/account')).toBe('/account');
    expect(safeNextPath('/c/abc?x=1')).toBe('/c/abc?x=1');
  });

  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    'javascript:alert(1)',
    '',
    'x'.repeat(600),
  ])('blocks %s', (next) => {
    expect(safeNextPath(next)).toBe('/account');
  });

  it('ignores non-strings (e.g. repeated query params)', () => {
    expect(safeNextPath(['/a', '/b'])).toBe('/account');
    expect(safeNextPath(undefined, '/')).toBe('/');
  });
});
