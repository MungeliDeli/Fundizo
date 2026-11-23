'use client';

import { type ComponentProps, useId, useState } from 'react';
import { cn } from '@/lib/cn';

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  /** Shown at the right of the label row, e.g. a "Forgot password?" link. */
  labelAside?: React.ReactNode;
  /** Shown inside the input box on the right, e.g. a show/hide button. */
  end?: React.ReactNode;
}

export function TextField({
  label,
  error,
  hint,
  labelAside,
  end,
  className,
  ...input
}: TextFieldProps) {
  const id = useId();
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-12 w-full rounded-control border bg-surface px-4 text-base text-ink outline-none transition',
            'placeholder:text-ink-3 focus:border-ink focus:ring-4 focus:ring-accent/15',
            error ? 'border-bad' : 'border-line',
            className,
          )}
          {...input}
        />
        {end ? <div className="absolute inset-y-0 right-2 flex items-center">{end}</div> : null}
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

/** Password input with a show/hide toggle. */
export function PasswordField(props: Omit<TextFieldProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      className="pr-20"
      end={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="h-8 rounded-lg px-3 text-sm font-semibold text-ink-2 hover:bg-sunk"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      }
    />
  );
}
