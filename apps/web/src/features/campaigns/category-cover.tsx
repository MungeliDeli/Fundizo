import type { CampaignCategory } from '@fundizo/shared';
import { CATEGORY_INFO } from '@fundizo/shared';
import { CATEGORY_ICON, Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

/**
 * Stand-in cover until photo upload arrives (slice 4): the category's icon on a soft, patterned
 * copper background. Decorative; the title carries the meaning.
 */
export function CategoryCover({
  category,
  compact = false,
  className,
}: {
  category: CampaignCategory;
  /** Small previews: icon only, no label. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-accent-soft',
        className,
      )}
      aria-hidden="true"
    >
      <svg className="absolute inset-0 h-full w-full text-accent opacity-[0.12]" aria-hidden="true">
        <defs>
          <pattern id={`dots-${category}`} width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.6" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#dots-${category})`} />
      </svg>
      <div className="relative flex flex-col items-center gap-3 text-accent-ink">
        <span
          className={cn(
            'grid place-items-center rounded-full bg-surface shadow-sm',
            compact ? 'size-12' : 'size-20 md:size-24',
          )}
        >
          <Icon name={CATEGORY_ICON[category]} size={compact ? 24 : 40} strokeWidth={1.6} />
        </span>
        {compact ? null : (
          <span className="text-sm font-semibold uppercase tracking-[0.08em]">
            {CATEGORY_INFO[category].label}
          </span>
        )}
      </div>
    </div>
  );
}
