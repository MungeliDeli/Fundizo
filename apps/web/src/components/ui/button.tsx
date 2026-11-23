import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'accent' | 'ink' | 'outline' | 'ghost';
type Size = 'lg' | 'md' | 'sm';

const VARIANTS: Record<Variant, string> = {
  // Copper: the main action on a screen (Sign up, Donate, Pay).
  accent: 'bg-accent text-on-accent hover:brightness-95',
  ink: 'bg-ink text-ground hover:opacity-90',
  outline: 'border border-line bg-surface text-ink hover:border-ink-3',
  ghost: 'bg-transparent text-accent-ink hover:underline',
};

const SIZES: Record<Size, string> = {
  lg: 'h-13 px-6 text-base',
  md: 'h-11 px-5 text-sm',
  sm: 'h-9 px-3.5 text-sm',
};

export function buttonClasses(variant: Variant = 'accent', size: Size = 'lg', className?: string) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-control font-semibold no-underline transition',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTS[variant],
    variant !== 'ghost' && SIZES[size],
    className,
  );
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner, disables the button and announces "busy" to screen readers. */
  loading?: boolean;
}

export function Button({
  variant,
  size,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
