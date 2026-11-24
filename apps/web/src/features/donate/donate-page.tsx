import { type PublicCampaign, formatKwacha, progressPercent } from '@fundizo/shared';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { CampaignCover } from '@/features/campaigns/campaign-cover';
import { DonateForm } from './donate-form';

/**
 * The donate page (D-01). Phone: "Donating to …" header, the form, a sticky pay bar.
 * Desktop: the form beside a summary of the fundraiser.
 */
export function DonatePage({ campaign: c }: { campaign: PublicCampaign }) {
  const who = c.beneficiary?.name ?? c.organiser.firstName;
  const pct = progressPercent(c.raisedNgwee, c.goalNgwee);
  return (
    <div className="container-page py-4 md:py-10">
      <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex items-center gap-3 border-b border-line pb-4">
            <CampaignCover
              photo={c.photos[0]}
              category={c.category}
              alt=""
              compact
              className="size-12 shrink-0 rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm text-ink-3">Donating to</p>
              <p className="m-0 truncate font-semibold">{c.title}</p>
            </div>
            <Link
              href={`/f/${c.slug}`}
              aria-label="Back to the fundraiser"
              className="grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-sunk"
            >
              <Icon name="close" size={20} />
            </Link>
          </header>
          <DonateForm slug={c.slug} beneficiary={who} />
        </div>
        <aside className="hidden flex-col gap-4 rounded-card border border-line bg-surface p-5 lg:sticky lg:top-24 lg:flex">
          <CampaignCover
            photo={c.photos[0]}
            category={c.category}
            alt={c.title}
            className="aspect-[4/3] w-full rounded-2xl"
          />
          <p className="m-0 font-semibold">{c.title}</p>
          <div className="flex items-baseline justify-between gap-3">
            <span className="display tabular text-2xl">{formatKwacha(c.raisedNgwee)}</span>
            {c.goalNgwee ? (
              <span className="text-sm text-ink-2">of {formatKwacha(c.goalNgwee)}</span>
            ) : null}
          </div>
          {c.goalNgwee ? (
            <div className="h-2 overflow-hidden rounded-full bg-sunk">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          ) : null}
          <p className="m-0 flex items-start gap-2 text-sm text-ink-2">
            <Icon name="shield" size={18} className="mt-0.5 shrink-0" />
            Money is held for {who} and can only be withdrawn after Fundizo has checked the
            organiser and the need.
          </p>
        </aside>
      </div>
    </div>
  );
}
