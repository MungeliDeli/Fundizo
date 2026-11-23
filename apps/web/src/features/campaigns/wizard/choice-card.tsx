'use client';

import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

/** A real radio input styled as a card: keyboard and screen-reader friendly. */
export function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  icon,
  label,
  hint,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  icon: IconName;
  label: string;
  hint?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex min-h-28 cursor-pointer flex-col items-start gap-1.5 rounded-2xl p-4 transition',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
        checked
          ? 'border-2 border-accent bg-accent-soft'
          : 'border border-line bg-surface hover:border-ink-3',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className={cn(
          'grid size-10 place-items-center rounded-full',
          checked ? 'bg-surface text-accent-ink' : 'bg-sunk text-ink-2',
        )}
      >
        <Icon name={icon} size={22} strokeWidth={1.8} />
      </span>
      <span className="text-base font-semibold text-ink">{label}</span>
      {hint ? (
        <span className={cn('text-sm', checked ? 'text-ink-2' : 'text-ink-3')}>{hint}</span>
      ) : null}
    </label>
  );
}
