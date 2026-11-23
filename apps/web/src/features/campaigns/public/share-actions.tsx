'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

/** Copy the link, or send it on WhatsApp with the title. The full share sheet comes with O-01. */
export function ShareActions({
  title,
  path,
  className,
}: {
  title: string;
  path: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const url = () => new URL(path, window.location.origin).toString();

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(title)}`}
        onClick={(e) => {
          e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(`${title}\n${url()}`)}`;
        }}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-line bg-surface text-sm font-semibold text-ink no-underline hover:border-ink-3"
      >
        <Icon name="chat" size={18} />
        WhatsApp
      </a>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url());
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            setCopied(false);
          }
        }}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-line bg-surface text-sm font-semibold text-ink hover:border-ink-3"
      >
        <Icon name={copied ? 'check' : 'link'} size={18} />
        <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
      </button>
    </div>
  );
}
