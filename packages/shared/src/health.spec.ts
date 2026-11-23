import { describe, expect, it } from 'vitest';
import { HealthResponse } from './health.js';

describe('HealthResponse', () => {
  const valid = {
    status: 'ok',
    version: '0.1.0',
    time: '2026-11-23T10:00:00.000Z',
    checks: { database: 'up', redis: 'up' },
  };

  it('accepts a valid response', () => {
    expect(HealthResponse.parse(valid)).toEqual(valid);
  });

  it('rejects unknown statuses', () => {
    expect(HealthResponse.safeParse({ ...valid, status: 'fine' }).success).toBe(false);
    expect(
      HealthResponse.safeParse({ ...valid, checks: { database: 'maybe', redis: 'up' } }).success,
    ).toBe(false);
  });
});
