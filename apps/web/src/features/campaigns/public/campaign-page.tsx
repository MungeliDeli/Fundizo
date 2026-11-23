import { CATEGORY_INFO, type PublicCampaign, formatKwacha, progressPercent } from '@fundizo/shared';
import { Alert } from '@/components/ui/alert';
import { Icon } from '@/components/ui/icon';
import { CampaignCover } from '../campaign-cover';
import { PhotoImage } from '../photos/photo-image';
import { ShareActions } from './share-actions';

/**
 * Public fundraiser page (C-07). Server-rendered for link previews and a fast first load.
 * Phone: one column, the progress card near the top. Desktop: story on the left, a sticky
 * donate card on the right.
 */
export function CampaignPage({
  campaign: c,
  justPublished,
}: {
  campaign: PublicCampaign;
  justPublished: boolean;
}) {
  const pct = progressPercent(c.raisedNgwee, c.goalNgwee);
  const place = [c.district, c.province].filter(Boolean).join(', ');
  const path = `/f/${c.slug}`;
  const organiser = `${c.organiser.firstName} ${c.organiser.lastName}`;
  const published = new Date(c.publishedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Lusaka',
  });

  const progress = (
    <section
      aria-label="Progress"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 md:p-6"
    >
      <div>
        <p className="display tabular m-0 text-4xl">{formatKwacha(c.raisedNgwee)}</p>
        <p className="m-0 mt-1 text-sm text-ink-2">
          {c.goalNgwee ? `raised of ${formatKwacha(c.goalNgwee)} goal` : 'raised'}
        </p>
      </div>
      {c.goalNgwee ? (
        <div
          className="h-2.5 overflow-hidden rounded-full bg-sunk"
          role="progressbar"
          aria-label={`${pct}% of the goal raised`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p className="m-0 text-sm text-ink-2">
        {c.donorCount === 0 ? 'Be one of the first to give.' : `${c.donorCount} donors`}
      </p>
      <button
        type="button"
        disabled
        className="h-13 w-full rounded-control bg-accent text-base font-semibold text-on-accent opacity-60"
      >
        Donations open soon
      </button>
      <p className="m-0 -mt-2 text-center text-xs text-ink-3">
        MTN MoMo and Airtel Money giving is on its way.
      </p>
      <ShareActions title={c.title} path={path} />
    </section>
  );

  return (
    <div className="container-page flex flex-col gap-6 py-6 md:py-10">
      {justPublished ? (
        <Alert tone="success">
          <strong>Your fundraiser is live.</strong> Share it now with the people who know{' '}
          {c.beneficiary ? c.beneficiary.name : 'you'}: family, church and work groups.
        </Alert>
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12">
        <article className="flex min-w-0 flex-col gap-6">
          <CampaignCover
            photo={c.photos[0]}
            category={c.category}
            alt={c.title}
            priority
            className="aspect-[4/3] w-full rounded-card sm:aspect-[16/9]"
          />
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <span className="inline-flex h-7 items-center rounded-full bg-sunk px-3 font-semibold text-ink">
                {CATEGORY_INFO[c.category].label}
              </span>
              {place ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="pin" size={16} />
                  {place}
                </span>
              ) : null}
            </div>
            <h1 className="display m-0 text-4xl">{c.title}</h1>
            <div className="flex items-center gap-3">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent-ink"
                aria-hidden="true"
              >
                {`${c.organiser.firstName[0] ?? ''}${c.organiser.lastName[0] ?? ''}`.toUpperCase()}
              </span>
              <p className="m-0 text-base text-ink-2">
                <strong className="font-semibold text-ink">{organiser}</strong> is organising this
                fundraiser
                {c.beneficiary ? (
                  <>
                    {' '}
                    for <strong className="font-semibold text-ink">{c.beneficiary.name}</strong> (
                    {c.beneficiary.relationship})
                  </>
                ) : null}
                .
              </p>
            </div>
          </header>

          <div className="lg:hidden">{progress}</div>

          <div className="flex items-start gap-3 rounded-card bg-sunk p-4">
            <Icon name="shield" size={20} className="mt-0.5 shrink-0 text-ink-2" />
            <div className="flex flex-col gap-1">
              <p className="m-0 font-semibold">Verification in progress</p>
              <p className="m-0 text-sm text-ink-2">
                Before any money can be withdrawn, Fundizo checks the organiser’s ID and the need
                behind this fundraiser.
              </p>
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="display m-0 text-2xl">What happened</h2>
            <p className="m-0 whitespace-pre-line text-lg text-ink-2">{c.story.whatHappened}</p>
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="display m-0 text-2xl">What the money is for</h2>
            <p className="m-0 whitespace-pre-line text-lg text-ink-2">{c.story.moneyFor}</p>
          </section>
          {c.story.extra ? (
            <section className="flex flex-col gap-3">
              <h2 className="display m-0 text-2xl">More from {c.organiser.firstName}</h2>
              <p className="m-0 whitespace-pre-line text-lg text-ink-2">{c.story.extra}</p>
            </section>
          ) : null}

          {c.photos.length > 1 ? (
            <section className="flex flex-col gap-3">
              <h2 className="display m-0 text-2xl">Photos</h2>
              <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
                {c.photos.slice(1).map((p, i) => (
                  <li key={p.id}>
                    <PhotoImage
                      photo={p}
                      size="thumb"
                      alt={`${c.title}, photo ${i + 2}`}
                      className="aspect-[4/3] rounded-2xl"
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="m-0 border-t border-line pt-4 text-sm text-ink-3">
            Started {published}. Every withdrawal will be shown on this page.
          </p>
        </article>

        <aside className="hidden lg:sticky lg:top-24 lg:block">{progress}</aside>
      </div>
    </div>
  );
}
