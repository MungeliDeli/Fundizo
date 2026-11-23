'use client';

import type { DependencyStatus } from '@fundizo/shared';
import { useApiHealth } from './use-api-health';

const DEPENDENCIES = [
  { key: 'api', label: 'Fundizo API', detail: 'Handles every request from this site' },
  { key: 'database', label: 'Database', detail: 'Campaigns, donations and the money ledger' },
  { key: 'redis', label: 'Background jobs and cache', detail: 'Payment checks, SMS and receipts' },
] as const;

/** Detailed system status (GET /api/health), refreshed every 10 seconds. */
export function StatusPanel() {
  const state = useApiHealth(10_000);

  const statusOf = (key: (typeof DEPENDENCIES)[number]['key']): DependencyStatus | 'checking' => {
    if (state.kind === 'loading') return 'checking';
    if (state.kind === 'unreachable') return 'down';
    if (key === 'api') return 'up';
    return state.health.checks[key];
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {DEPENDENCIES.map((d) => {
          const s = statusOf(d.key);
          return (
            <li
              key={d.key}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 text-base font-semibold">{d.label}</h2>
                <StatusBadge status={s} />
              </div>
              <p className="m-0 text-sm text-ink-3">{d.detail}</p>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-sm text-ink-3" aria-live="polite">
        {state.kind === 'ok' || state.kind === 'degraded'
          ? `API version ${state.health.version} · checked ${new Date(state.health.time).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka' })} (Lusaka time)`
          : state.kind === 'unreachable'
            ? 'Fundizo’s servers did not answer. Please try again in a moment.'
            : 'Checking…'}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: DependencyStatus | 'checking' }) {
  const styles = {
    up: 'bg-good-soft text-good',
    down: 'bg-bad-soft text-bad',
    checking: 'bg-sunk text-ink-3',
  } as const;
  const label = { up: 'Working', down: 'Down', checking: 'Checking' } as const;
  return (
    <span
      className={`inline-flex h-7 items-center rounded-full px-2.5 text-[12.5px] font-semibold ${styles[status]}`}
    >
      {label[status]}
    </span>
  );
}
