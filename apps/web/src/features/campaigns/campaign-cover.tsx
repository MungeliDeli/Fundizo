import type { CampaignCategory, Photo } from '@fundizo/shared';
import { CategoryCover } from './category-cover';
import { PhotoImage } from './photos/photo-image';

/** The cover photo when there is one; otherwise the category illustration. */
export function CampaignCover({
  photo,
  category,
  alt,
  className,
  compact = false,
  priority = false,
}: {
  photo: Photo | undefined;
  category: CampaignCategory | null;
  alt: string;
  className?: string;
  compact?: boolean;
  priority?: boolean;
}) {
  if (photo)
    return (
      <PhotoImage
        photo={photo}
        size={compact ? 'thumb' : 'full'}
        alt={alt}
        className={className}
        priority={priority}
      />
    );
  if (category)
    return <CategoryCover category={category} compact={compact} className={className} />;
  return <div className={`bg-sunk ${className ?? ''}`} aria-hidden="true" />;
}
