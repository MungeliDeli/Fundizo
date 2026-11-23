import { CATEGORY_INFO, OwnCampaignList, formatKwacha } from '@fundizo/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TogetherIllustration } from '@/components/illustrations/scenes';
import { buttonClasses } from '@/components/ui/button';
import { CategoryCover } from '@/features/campaigns/category-cover';
import { resumeStep } from '@/features/campaigns/resume-step';
import { stepHref } from '@/features/campaigns/wizard/steps';
import { serverGet } from '@/lib/server-api';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Your fundraisers', robots: { index: false } };

/** The organiser's drafts and live fundraisers (B-01 comes later with totals and donors). */
export default async function FundraisersPage() {
  if (!(await getCurrentUser())) redirect('/login?next=/fundraisers');
  const data = await serverGet('/campaigns/mine', OwnCampaignList);
  const list = data?.campaigns ?? [];
  const updated = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Africa/Lusaka',
    });

  return (
    <div className="container-page flex flex-col gap-8 py-8 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="display m-0 text-4xl">Your fundraisers</h1>
          <p className="m-0 text-ink-2">Drafts are saved as you go. Pick up where you left off.</p>
        </div>
        {list.length > 0 ? (
          <Link href="/start" className={buttonClasses('accent', 'md')}>
            Start a fundraiser
          </Link>
        ) : null}
      </div>

      {list.length === 0 ? (
        <section className="grid items-center gap-8 rounded-card bg-accent-soft p-6 md:grid-cols-[1fr_1.1fr] md:p-12">
          <TogetherIllustration className="mx-auto max-w-xs md:max-w-md" />
          <div className="flex flex-col gap-4">
            <h2 className="display m-0 text-3xl">Raise it together</h2>
            <p className="m-0 text-ink-2">
              A hospital bill, a funeral, school fees or a new church roof. Start a fundraiser in a
              few minutes and share it with the people who care.
            </p>
            <Link href="/start" className={buttonClasses('accent', 'lg', 'self-start')}>
              Start a fundraiser
            </Link>
          </div>
        </section>
      ) : (
        <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => {
            const live = c.status === 'published' && c.slug;
            return (
              <li
                key={c.id}
                className="flex flex-col overflow-hidden rounded-card border border-line bg-surface"
              >
                {c.category ? (
                  <CategoryCover category={c.category} compact className="h-32" />
                ) : (
                  <div className="h-32 bg-sunk" />
                )}
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${live ? 'bg-good-soft text-good' : 'bg-sunk text-ink-2'}`}
                    >
                      {live ? 'Live' : 'Draft'}
                    </span>
                    <span className="text-xs text-ink-3">
                      {c.category ? CATEGORY_INFO[c.category].label : 'No category yet'} · updated{' '}
                      {updated(c.updatedAt)}
                    </span>
                  </div>
                  <h2 className="display m-0 text-xl leading-snug">
                    {c.title || 'Untitled draft'}
                  </h2>
                  <p className="m-0 text-sm text-ink-2">
                    {c.goalNgwee ? `Goal ${formatKwacha(c.goalNgwee)}` : 'No goal set'}
                  </p>
                  <div className="mt-auto pt-2">
                    {live ? (
                      <Link
                        href={`/f/${c.slug}`}
                        className={buttonClasses('outline', 'md', 'w-full')}
                      >
                        View fundraiser
                      </Link>
                    ) : (
                      <Link
                        href={stepHref(c.id, resumeStep(c))}
                        className={buttonClasses('ink', 'md', 'w-full')}
                      >
                        Continue
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
