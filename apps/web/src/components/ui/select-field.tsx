'use client';

import { type ComponentProps, useId } from 'react';
import { cn } from '@/lib/cn';

interface SelectFieldProps extends Omit<ComponentProps<'select'>, 'id'> {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}

/** A native <select> styled like TextField: native keeps phone pickers and accessibility for free. */
export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...select
}: SelectFieldProps) {
  const id = useId();
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-12 w-full appearance-none rounded-control border bg-surface pl-4 pr-10 text-base text-ink outline-none transition',
            'focus:border-ink focus:ring-4 focus:ring-accent/15',
            error ? 'border-bad' : 'border-line',
            className,
          )}
          {...select}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-3"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {error ? (
        <p id={`${id}-error`} className="m-0 text-sm text-bad">
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="text-sm text-ink-3">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
