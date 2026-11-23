'use client';

import { HealthResponse } from '@fundizo/shared';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

export type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'degraded'; health: HealthResponse }
  | { kind: 'unreachable' };

const POLL_MS = 30_000;

/** Polls GET /api/health. 503 is an expected answer ("degraded"), not a network failure. */
export function useApiHealth(pollMs = POLL_MS): HealthState {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const health = await apiGet('/health', HealthResponse, {
          cache: 'no-store',
          acceptStatuses: [503],
        });
        if (!cancelled) setState({ kind: health.status === 'ok' ? 'ok' : 'degraded', health });
      } catch {
        if (!cancelled) setState({ kind: 'unreachable' });
      }
    };
    void load();
    const timer = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  return state;
}
