'use client';

import {
  CATEGORY_INFO,
  type OwnCampaign,
  OwnCampaignResponse,
  formatKwacha,
  publishProblems,
} from '@fundizo/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ApiError, apiPost } from '@/lib/api';
import { formError } from '@/features/auth/error-messages';
import { CategoryCover } from '../category-cover';
import { stepHref, type WizardStep } from './steps';

interface Props {
  campaign: OwnCampaign;
  organiser: {
    firstName: string;
    lastName: string;
    emailVerified: boolean;
    phoneConfirmed: boolean;
  };
}

/** Step 5 (C-07): everything at a glance, what's missing, and Publish. */
export function StepReview({ campaign: c, organiser }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({});
  const problems = publishProblems(c, {
    emailVerified: organiser.emailVerified,
    phoneVerified: organiser.phoneConfirmed,
  });
  const ready = problems.length === 0;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const { campaign } = await apiPost(`/campaigns/${c.id}/publish`, {}, OwnCampaignResponse);
      router.push(`/f/${campaign.slug}?published=1`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_publishable') setServerProblems(err.fields);
      setError(formError(err));
      setBusy(false);
    }
  }

  const who =
    c.beneficiary.kind === 'self'
      ? `${organiser.firstName} ${organiser.lastName} (you)`
      : `${c.beneficiary.name} (${c.beneficiary.relationship})`;
  const place = [c.district, c.province].filter(Boolean).join(', ');
  const rows: Array<{ step: WizardStep; label: string; value: string }> = [
    { step: 'who', label: 'For', value: who },
    {
      step: 'category',
      label: 'Category',
      value: c.category ? CATEGORY_INFO[c.category].label : 'Not chosen',
    },
    {
      step: 'goal',
      label: 'Goal',
      value: c.goalNgwee
        ? formatKwacha(c.goalNgwee)
        : c.category === 'funeral'
          ? 'No goal (funeral)'
          : 'Not set',
    },
    {
      step: 'goal',
      label: 'Ends',
      value: c.endDate
        ? new Date(`${c.endDate}T12:00:00Z`).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : 'Open until you end it',
    },
    { step: 'goal', label: 'Place', value: place || 'Not set' },
    { step: 'story', label: 'Title', value: c.title || 'Not written yet' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <section
          className="flex flex-col rounded-card border border-line bg-surface"
          aria-label="Summary"
        >
          <dl className="m-0 flex flex-col">
            {rows.map((r, i) => (
              <div
                key={r.label}
                className={`flex items-start justify-between gap-4 px-5 py-4 ${i > 0 ? 'border-t border-line' : ''}`}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                    {r.label}
                  </dt>
                  <dd className="m-0 break-words text-base">{r.value}</dd>
                </div>
                <Link
                  href={stepHref(c.id, r.step)}
                  className="shrink-0 text-sm font-semibold text-accent-ink"
                  aria-label={`Edit ${r.label.toLowerCase()}`}
                >
                  Edit
                </Link>
              </div>
            ))}
            <div className="flex flex-col gap-2 border-t border-line px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                  Story
                </dt>
                <Link
                  href={stepHref(c.id, 'story')}
                  className="text-sm font-semibold text-accent-ink"
                  aria-label="Edit story"
                >
                  Edit
                </Link>
              </div>
              <dd className="m-0 line-clamp-4 whitespace-pre-line text-base text-ink-2">
                {c.story.whatHappened || 'Not written yet'}
              </dd>
            </div>
          </dl>
        </section>

        <aside className="flex flex-col gap-2" aria-label="How it looks when shared">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
            How your link looks in WhatsApp
          </p>
          <div className="rounded-card bg-sunk p-3">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {c.category ? (
                <CategoryCover category={c.category} compact className="h-24" />
              ) : (
                <div className="h-24 bg-line" />
              )}
              <div className="flex flex-col gap-0.5 px-3 py-2.5">
                <p className="m-0 text-sm font-semibold leading-snug">{c.title || 'Your title'}</p>
                <p className="m-0 text-xs text-ink-3">
                  {c.goalNgwee ? `Goal ${formatKwacha(c.goalNgwee)} · ` : ''}fundizo
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {ready ? (
        <div className="flex flex-col gap-2 rounded-card bg-good-soft p-5">
          <p className="m-0 flex items-center gap-2 font-semibold text-good">
            <Icon name="check" size={18} strokeWidth={3} />
            Ready to publish
          </p>
          <p className="m-0 text-sm text-ink-2">
            It goes live straight away and you can share it at once. Withdrawals unlock after we’ve
            checked the people and the need, while it raises.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-card bg-accent-soft p-5" role="status">
          <p className="m-0 font-semibold">Before you can publish</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {problems.map((p) => (
              <li
                key={p.message}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span>{serverProblems[p.step] ?? p.message}</span>
                <Link
                  href={p.step === 'account' ? '/account' : stepHref(c.id, p.step)}
                  className="font-semibold text-accent-ink"
                >
                  {p.step === 'account' ? 'Go to your profile' : 'Fix this'}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        size="lg"
        onClick={publish}
        loading={busy}
        disabled={!ready}
        className="w-full sm:w-auto sm:self-start sm:px-10"
      >
        Publish fundraiser
      </Button>
    </div>
  );
}
