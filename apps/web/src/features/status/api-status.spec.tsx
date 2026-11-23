import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiStatusPill } from './api-status-pill';
import { StatusPanel } from './status-panel';

const healthy = {
  status: 'ok',
  version: '0.1.0',
  time: '2026-11-23T10:00:00.000Z',
  checks: { database: 'up', redis: 'up' },
};

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

afterEach(() => vi.unstubAllGlobals());

describe('ApiStatusPill', () => {
  it('calls the API through the same-origin /api proxy', async () => {
    const fetch = mockFetch(() => json(healthy));
    render(<ApiStatusPill />);
    expect(await screen.findByText('All systems working')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('treats 503 as degraded, not unreachable', async () => {
    mockFetch(() =>
      json({ ...healthy, status: 'degraded', checks: { database: 'up', redis: 'down' } }, 503),
    );
    render(<ApiStatusPill />);
    expect(await screen.findByText('Some services are down')).toBeInTheDocument();
  });

  it('says when the API cannot be reached', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    render(<ApiStatusPill />);
    expect(await screen.findByText('Can’t reach Fundizo’s servers')).toBeInTheDocument();
  });

  it('does not trust a malformed response', async () => {
    mockFetch(() => json({ status: 'ok' }));
    render(<ApiStatusPill />);
    expect(await screen.findByText('Can’t reach Fundizo’s servers')).toBeInTheDocument();
  });
});

describe('StatusPanel', () => {
  it('shows each dependency', async () => {
    mockFetch(() =>
      json({ ...healthy, status: 'degraded', checks: { database: 'up', redis: 'down' } }, 503),
    );
    render(<StatusPanel />);
    expect(await screen.findByText('Down')).toBeInTheDocument();
    expect(screen.getAllByText('Working')).toHaveLength(2); // API + database
    expect(screen.getByText(/API version 0\.1\.0/)).toBeInTheDocument();
  });
});
