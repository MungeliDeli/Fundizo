import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { previousStep, stepHref, WIZARD_STEPS, type WizardStep } from './steps';

interface WizardShellProps {
  step: WizardStep;
  /** Null on step 1 before the draft exists. */
  campaignId: string | null;
  title: string;
  subtitle?: ReactNode;
  /** Tips or a live preview beside the form on desktop. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * The create-a-fundraiser wizard frame (C-01). Phone: progress bar and one task per screen.
 * Desktop: the steps listed on the left, the form in the middle, tips or a preview on the right.
 */
export function WizardShell({
  step,
  campaignId,
  title,
  subtitle,
  aside,
  children,
}: WizardShellProps) {
  const index = WIZARD_STEPS.findIndex((s) => s.id === step);
  const prev = previousStep(step);
  const backHref = prev && campaignId ? stepHref(campaignId, prev) : '/fundraisers';

  return (
    <div className="container-page py-6 md:py-10">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={backHref}
          className="inline-flex h-11 items-center gap-1 text-sm font-semibold text-ink-2 no-underline hover:text-ink"
        >
          <Icon name="back" size={18} />
          {prev ? 'Back' : 'Your fundraisers'}
        </Link>
        <span className="text-sm text-ink-3 lg:hidden">
          Step {index + 1} of {WIZARD_STEPS.length}
        </span>
        <Link
          href="/fundraisers"
          className="text-sm font-semibold text-ink-2 no-underline hover:text-ink"
        >
          Save and exit
        </Link>
      </div>
      <div
        className="mt-3 grid grid-cols-5 gap-1.5 lg:hidden"
        role="progressbar"
        aria-label="Fundraiser setup progress"
        aria-valuemin={1}
        aria-valuemax={WIZARD_STEPS.length}
        aria-valuenow={index + 1}
      >
        {WIZARD_STEPS.map((s, i) => (
          <span
            key={s.id}
            className={cn('h-1.5 rounded-full', i <= index ? 'bg-ink' : 'bg-line')}
          />
        ))}
      </div>

      <div
        className={cn(
          'mt-6 grid gap-8 lg:mt-8 lg:gap-10',
          aside ? 'lg:grid-cols-[13rem_minmax(0,1fr)_18rem]' : 'lg:grid-cols-[13rem_minmax(0,1fr)]',
        )}
      >
        <nav aria-label="Steps" className="hidden lg:block">
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {WIZARD_STEPS.map((s, i) => {
              const done = i < index;
              const current = i === index;
              const label = (
                <>
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                      current
                        ? 'bg-ink text-ground'
                        : done
                          ? 'bg-good-soft text-good'
                          : 'bg-sunk text-ink-3',
                    )}
                  >
                    {done ? <Icon name="check" size={14} strokeWidth={3} /> : i + 1}
                  </span>
                  <span
                    className={cn('text-sm', current ? 'font-semibold text-ink' : 'text-ink-2')}
                  >
                    {s.label}
                  </span>
                </>
              );
              return (
                <li key={s.id}>
                  {done && campaignId ? (
                    <Link
                      href={stepHref(campaignId, s.id)}
                      className="flex items-center gap-3 rounded-control px-2 py-2 no-underline hover:bg-sunk"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span
                      className="flex items-center gap-3 px-2 py-2"
                      aria-current={current ? 'step' : undefined}
                    >
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="display m-0 text-3xl">{title}</h1>
            {subtitle ? <p className="m-0 text-base text-ink-2">{subtitle}</p> : null}
          </header>
          {children}
        </div>

        {aside ? <aside className="hidden lg:block">{aside}</aside> : null}
      </div>
    </div>
  );
}

/** A calm tip card for the desktop aside. */
export function TipCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sticky top-24 flex flex-col gap-2 rounded-card bg-sunk p-5">
      <p className="m-0 flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon name="shield" size={16} />
        {title}
      </p>
      <div className="flex flex-col gap-2 text-sm text-ink-2">{children}</div>
    </div>
  );
}
