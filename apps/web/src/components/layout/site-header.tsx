'use client';

import type { PublicUser } from '@fundizo/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/wordmark';
import { NAV_ITEMS } from './nav-items';

type HeaderUser = Pick<PublicUser, 'firstName' | 'lastName'> | null;

/**
 * Responsive header. Desktop (md+): wordmark, inline links and account actions. Phone: wordmark,
 * the main call to action, and a menu button that opens the same links as a panel.
 */
export function SiteHeader({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it with no effect needed.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);
  const menuId = useId();
  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '';

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="text-2xl text-ink no-underline" aria-label="Fundizo home">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 md:block">
          <ul className="m-0 flex list-none items-center justify-end gap-8 p-0">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-base font-medium text-ink-2 no-underline hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2 md:gap-4 md:border-l md:border-line md:pl-6">
          {user ? (
            <Link
              href="/account"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-sm font-semibold text-ink no-underline hover:bg-sunk md:pr-3"
              aria-label={`Your account (${user.firstName})`}
            >
              <span
                className="grid size-9 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent-ink"
                aria-hidden="true"
              >
                {initials}
              </span>
              <span className="hidden md:inline">{user.firstName}</span>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-base font-semibold text-ink no-underline hover:text-accent-ink md:inline"
              >
                Log in
              </Link>
              <Link href="/signup" className={buttonClasses('accent', 'sm', 'md:h-10 md:px-4')}>
                Sign up
              </Link>
            </>
          )}

          <button
            type="button"
            className="grid size-11 place-items-center rounded-full text-ink md:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen(!open)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav id={menuId} aria-label="Main" className="border-t border-line bg-ground md:hidden">
          <ul className="container-page m-0 flex list-none flex-col py-2">
            {[
              ...NAV_ITEMS,
              user
                ? { label: 'Your account', href: '/account' }
                : { label: 'Log in', href: '/login' },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-12 items-center text-base font-medium text-ink no-underline"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
