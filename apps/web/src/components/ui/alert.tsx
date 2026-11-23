import { cn } from '@/lib/cn';

const TONES = {
  error: 'border-bad/30 bg-bad-soft text-bad',
  success: 'border-good/30 bg-good-soft text-good',
  info: 'border-line bg-sunk text-ink-2',
} as const;

/** Form-level message. Errors are announced immediately to screen readers. */
export function Alert({
  tone = 'info',
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-control border px-4 py-3 text-sm', TONES[tone], className)}
    >
      {children}
    </div>
  );
}
