'use client';

import { CAMPAIGN_CATEGORIES, type CampaignCategory, CATEGORY_INFO } from '@fundizo/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CATEGORY_ICON } from '@/components/ui/icon';
import { ChoiceCard } from './choice-card';
import { stepHref } from './steps';
import { useSaveDraft } from './use-save-draft';

/** Step 2 (C-03): what the money is for. Sets which evidence verification asks for later. */
export function StepCategory({
  campaignId,
  initial,
}: {
  campaignId: string;
  initial: CampaignCategory | null;
}) {
  const router = useRouter();
  const draft = useSaveDraft(campaignId);
  const [category, setCategory] = useState<CampaignCategory | null>(initial);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) {
      setError('Choose the closest match. You can say more in your story.');
      return;
    }
    if (await draft.save({ category })) router.push(stepHref(campaignId, 'goal'));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {error || draft.error ? <Alert tone="error">{error ?? draft.error}</Alert> : null}
      <fieldset className="m-0 grid grid-cols-2 gap-3 border-0 p-0 md:grid-cols-3">
        <legend className="sr-only">What is the fundraiser for?</legend>
        {CAMPAIGN_CATEGORIES.map((c) => (
          <ChoiceCard
            key={c}
            name="category"
            value={c}
            checked={category === c}
            onChange={() => {
              setCategory(c);
              setError(null);
            }}
            icon={CATEGORY_ICON[c]}
            label={CATEGORY_INFO[c].label}
            hint={CATEGORY_INFO[c].hint}
          />
        ))}
      </fieldset>
      {category === 'funeral' ? (
        <p role="status" className="m-0 rounded-control bg-sunk px-4 py-3 text-sm text-ink-2">
          <strong className="text-ink">Funeral fundraisers don’t need a goal.</strong> Families can
          share it right away, and we’ll verify it quickly with a burial permit or a referee.
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        loading={draft.saving}
        className="w-full sm:w-auto sm:self-start sm:px-10"
      >
        Continue
      </Button>
    </form>
  );
}
