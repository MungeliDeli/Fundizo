import { type PublicDonationsResponse, formatKwacha } from '@fundizo/shared';

const ago = (iso: string) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lusaka',
  });
};

/** The donor wall (U-04): the latest gifts, names only if the donor chose to show one. */
export function DonorWall({ donations }: { donations: PublicDonationsResponse }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="donors-title">
      <h2 id="donors-title" className="display m-0 text-2xl">
        Donors{' '}
        {donations.donorCount > 0 ? (
          <span className="text-ink-3">({donations.donorCount})</span>
        ) : null}
      </h2>
      {donations.donations.length === 0 ? (
        <p className="m-0 text-ink-3">No gifts yet. Yours could be the first.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col rounded-card border border-line bg-surface p-0">
          {donations.donations.map((d, i) => {
            const name = d.name ?? 'Anonymous';
            return (
              <li
                key={`${d.createdAt}-${i}`}
                className={`flex gap-3 px-4 py-3.5 ${i ? 'border-t border-line' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${d.name ? 'bg-accent-soft text-accent-ink' : 'bg-sunk text-ink-3'}`}
                >
                  {d.name ? name.slice(0, 1).toUpperCase() : '♥'}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold">{name}</span>
                    <span className="tabular font-semibold">{formatKwacha(d.amountNgwee)}</span>
                  </p>
                  <p className="m-0 text-xs text-ink-3">{ago(d.createdAt)}</p>
                  {d.message ? (
                    <p className="m-0 mt-1 break-words text-ink-2">“{d.message}”</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
