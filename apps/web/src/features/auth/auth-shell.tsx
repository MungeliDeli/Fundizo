import type { ReactNode } from 'react';

const PROMISES = [
  'Pay and get paid with MTN MoMo and Airtel Money',
  'Every fundraiser is checked before money moves',
  'A public trail of every withdrawal',
] as const;

interface AuthShellProps {
  illustration: ReactNode;
  /** Big line on the illustration panel (desktop). */
  panelTitle: string;
  panelText: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Small links under the form, e.g. "New to Fundizo? Sign up". */
  footer?: ReactNode;
}

/**
 * Layout for every account screen. Desktop: illustration panel left, form right.
 * Phone: a compact illustration band, then the form. One task per screen.
 */
export function AuthShell({
  illustration,
  panelTitle,
  panelText,
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="container-page grid gap-6 py-6 md:py-10 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.05fr_1fr] lg:items-stretch lg:gap-12">
      <aside className="relative flex flex-col items-center justify-center overflow-hidden rounded-[1.75rem] bg-accent-soft px-6 py-6 lg:items-start lg:justify-between lg:px-12 lg:py-12">
        <div className="w-full max-w-[15rem] sm:max-w-[18rem] lg:mx-auto lg:max-w-md">
          {illustration}
        </div>
        <div className="hidden flex-col gap-4 lg:flex">
          <p className="display m-0 text-3xl text-ink">{panelTitle}</p>
          <p className="m-0 max-w-md text-base text-ink-2">{panelText}</p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2.5 p-0">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-3 text-sm text-ink">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-good text-surface">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="flex flex-col justify-center lg:py-8">
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="display m-0 text-3xl">{title}</h1>
            {subtitle ? <p className="m-0 text-base text-ink-2">{subtitle}</p> : null}
          </header>
          {children}
          {footer ? (
            <div className="border-t border-line pt-5 text-sm text-ink-2">{footer}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
