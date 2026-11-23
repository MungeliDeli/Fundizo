'use client';

import {
  CAMPAIGN_TITLE_MAX,
  type CampaignCategory,
  type Photo,
  CampaignDraftUpdate,
  STORY_MIN,
  type Story,
} from '@fundizo/shared';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { fieldErrors } from '@/lib/api';
import { cn } from '@/lib/cn';
import { CampaignCover } from '../campaign-cover';
import { nextStep, stepHref } from './steps';
import { useSaveDraft } from './use-save-draft';

const PROMPTS: ReadonlyArray<{
  key: keyof Story;
  label: string;
  placeholder: string;
  rows: number;
}> = [
  {
    key: 'whatHappened',
    label: 'Who needs help, and what happened?',
    placeholder:
      'e.g. My brother Joseph is 34. In October doctors at Kabwe General found a blocked heart valve and referred him to UTH.',
    rows: 5,
  },
  {
    key: 'moneyFor',
    label: 'What will the money pay for?',
    placeholder: 'e.g. The operation and two weeks in hospital.',
    rows: 3,
  },
  {
    key: 'extra',
    label: 'Anything else donors should know? (optional)',
    placeholder: 'e.g. How you’ll share receipts and updates.',
    rows: 3,
  },
];

/** Step 4 (C-04): title and guided story prompts, with a live preview. */
export function StepStory({
  campaignId,
  category,
  initial,
}: {
  campaignId: string;
  category: CampaignCategory | null;
  initial: { title: string; story: Story; photos?: Photo[] };
}) {
  const router = useRouter();
  const draft = useSaveDraft(campaignId);
  const ids = useId();
  const [title, setTitle] = useState(initial.title);
  const [story, setStory] = useState<Story>(initial.story);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (title.trim().length < 10) local.title = 'Give it a title of at least 10 characters.';
    if (story.whatHappened.trim().length < STORY_MIN)
      local.whatHappened = `Tell people what happened, in at least ${STORY_MIN} characters.`;
    if (story.moneyFor.trim().length < 10) local.moneyFor = 'Say what the money will pay for.';
    const parsed = CampaignDraftUpdate.safeParse({ title, story });
    if (!parsed.success || Object.keys(local).length > 0) {
      setErrors({ ...(parsed.success ? {} : fieldErrors(parsed.error)), ...local });
      return;
    }
    setErrors({});
    if (await draft.save(parsed.data)) router.push(stepHref(campaignId, nextStep('story')));
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {draft.error ? <Alert tone="error">{draft.error}</Alert> : null}
        <TextField
          label="Title"
          labelAside={
            <span
              className={cn(
                'tabular text-sm',
                title.length > CAMPAIGN_TITLE_MAX - 5 ? 'text-accent-ink' : 'text-ink-3',
              )}
            >
              {title.length} / {CAMPAIGN_TITLE_MAX}
            </span>
          }
          placeholder="e.g. Help Joseph get his heart surgery at UTH"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={CAMPAIGN_TITLE_MAX}
          error={errors.title}
          className="font-semibold"
        />
        {PROMPTS.map((p) => {
          const id = `${ids}-${p.key}`;
          const error = errors[p.key];
          return (
            <div key={p.key} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="text-sm font-semibold">
                {p.label}
              </label>
              <textarea
                id={id}
                rows={p.rows}
                maxLength={3000}
                placeholder={p.placeholder}
                value={story[p.key]}
                onChange={(e) => setStory((s) => ({ ...s, [p.key]: e.target.value }))}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={cn(
                  'w-full resize-y rounded-control border bg-surface px-4 py-3 text-base text-ink outline-none transition',
                  'placeholder:text-ink-3 focus:border-ink focus:ring-4 focus:ring-accent/15',
                  error ? 'border-bad' : 'border-line',
                )}
              />
              {error ? (
                <p id={`${id}-error`} className="m-0 text-sm text-bad">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
        <p className="m-0 text-sm text-ink-3">
          Be specific: names, places, amounts. People give to what they can picture.
        </p>
        <Button
          type="submit"
          size="lg"
          loading={draft.saving}
          className="w-full sm:w-auto sm:self-start sm:px-10"
        >
          Continue
        </Button>
      </form>

      <aside className="hidden xl:block" aria-label="Preview">
        <div className="sticky top-24 flex flex-col gap-2">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
            Preview
          </p>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <CampaignCover
              photo={initial.photos?.[0]}
              category={category}
              alt={title}
              compact
              className="h-28"
            />
            <div className="flex flex-col gap-2 p-4">
              <p className="display m-0 text-lg leading-snug">{title || 'Your title'}</p>
              <p className="m-0 line-clamp-6 text-sm text-ink-2">
                {story.whatHappened || 'Your story will appear here.'}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
