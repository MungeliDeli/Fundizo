'use client';

import { useApiHealth, type HealthState } from './use-api-health';

const LABEL: Record<HealthState['kind'], string> = {
  loading: 'Checking systems…',
  ok: 'All systems working',
  degraded: 'Some services are down',
  unreachable: 'Can’t reach Fundizo’s servers',
};

const DOT: Record<HealthState['kind'], string> = {
  loading: 'bg-ink-3',
  ok: 'bg-good',
  degraded: 'bg-accent',
  unreachable: 'bg-bad',
};

/** Small status indicator for the footer; links to /status for details. */
export function ApiStatusPill() {
  const state = useApiHealth();
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink-2">
      <span className={`size-2 rounded-full ${DOT[state.kind]}`} aria-hidden="true" />
      <span role="status">{LABEL[state.kind]}</span>
    </span>
  );
}
