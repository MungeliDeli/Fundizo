import type { PublicUser } from '@fundizo/shared';
import { cn } from '@/lib/cn';

/**
 * What a person still needs before they can publish a fundraiser (verification level 1).
 * Withdrawals later also need ID (level 2, slice 13).
 */
export function PublishReadiness({ user }: { user: PublicUser }) {
  const steps = [
    { label: 'Email confirmed', done: user.emailVerified },
    { label: 'Phone number confirmed', done: user.phone !== null },
  ];
  const ready = steps.every((s) => s.done);
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-card p-6 md:p-8',
        ready ? 'bg-good-soft' : 'bg-accent-soft',
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="display m-0 text-xl">
          {ready ? 'Ready to start a fundraiser' : 'Ready to start a fundraiser?'}
        </h2>
        <p className="m-0 text-sm text-ink-2">
          {ready
            ? 'You’ve done the checks needed to publish. Starting a fundraiser opens soon.'
            : 'Two quick checks protect donors. You’ll need both before publishing.'}
        </p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-base">
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full border-2',
                s.done ? 'border-good bg-good text-surface' : 'border-ink-3 bg-transparent',
              )}
              aria-hidden="true"
            >
              {s.done ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : null}
            </span>
            <span className={s.done ? 'text-ink' : 'text-ink-2'}>
              {s.label}
              <span className="sr-only">{s.done ? ' (done)' : ' (not done yet)'}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
