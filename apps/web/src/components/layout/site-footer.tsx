import Link from 'next/link';
import { Wordmark } from '@/components/ui/wordmark';
import { ApiStatusPill } from '@/features/status/api-status-pill';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="container-page flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <Wordmark className="text-xl" />
          <p className="m-0 text-sm text-ink-3">Raise and give together, in Zambia.</p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <Link href="/status" className="no-underline" aria-label="System status">
            <ApiStatusPill />
          </Link>
          <p className="m-0 text-xs text-ink-3">© {new Date().getFullYear()} Fundizo</p>
        </div>
      </div>
    </footer>
  );
}
