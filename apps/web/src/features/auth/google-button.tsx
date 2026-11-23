import { cn } from '@/lib/cn';

/**
 * "Continue with Google". A plain link (full page navigation), not next/link: it leaves the site
 * for Google, through the API's /auth/google/start. Never prefetched.
 */
export function GoogleButton({
  next = '/account',
  label = 'Continue with Google',
  fullWidth = true,
  className,
}: {
  next?: string;
  label?: string;
  fullWidth?: boolean;
  className?: string;
}) {
  return (
    <a
      href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
      rel="nofollow"
      className={cn(
        'inline-flex h-13 items-center justify-center gap-3 rounded-control border border-line bg-surface px-5 text-base font-semibold text-ink no-underline transition hover:border-ink-3',
        fullWidth && 'w-full',
        className,
      )}
    >
      <GoogleMark />
      {label}
    </a>
  );
}

/** Google's "G" mark. Brand colours are fixed by Google's guidelines, hence raw hex values here. */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

/** "or" divider between Google and the email form. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-4 text-sm text-ink-3" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
