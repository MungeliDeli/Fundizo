import { DevLedgerResponse, formatKwacha } from '@fundizo/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { TestDonationForm } from '@/features/dev/test-donation-form';

export const metadata: Metadata = { title: 'Dev ledger', robots: { index: false } };
export const dynamic = 'force-dynamic';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Lusaka',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Signed amounts: a minus sign rather than a float or a negative format. */
const money = (ngwee: number) => (ngwee < 0 ? `−${formatKwacha(-ngwee)}` : formatKwacha(ngwee));

/** Development only: the books (F-06), the job queue (F-09) and pretend donations. */
export default async function DevLedgerPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const res = await fetch(`${API_INTERNAL_URL}/dev/ledger`, { cache: 'no-store' }).catch(
    () => null,
  );
  const parsed = res?.ok ? DevLedgerResponse.safeParse(await res.json()) : null;
  const data = parsed?.success ? parsed.data : null;

  return (
    <div className="container-page flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-accent-ink">
          Development only
        </p>
        <h1 className="display m-0 text-3xl">Ledger</h1>
        <p className="m-0 max-w-prose text-ink-2">
          Every ngwee is recorded twice: once where it came from (a debit) and once where it went (a
          credit). Balances are always added up from these lines, never typed in. The database
          refuses edits, deletes and lopsided entries. Emails sent by background jobs show in the{' '}
          <Link href="/dev/outbox" className="font-semibold text-accent-ink">
            outbox
          </Link>
          .
        </p>
      </div>
      {!data ? <p className="text-bad">Couldn’t reach the API.</p> : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <section
                aria-labelledby="totals-title"
                className={`flex flex-col gap-3 rounded-card p-5 ${data.totals.balanced ? 'bg-good-soft' : 'bg-bad-soft'}`}
              >
                <h2
                  id="totals-title"
                  className={`m-0 flex items-center gap-2 text-lg font-semibold ${data.totals.balanced ? 'text-good' : 'text-bad'}`}
                >
                  <Icon
                    name={data.totals.balanced ? 'check' : 'emergency'}
                    size={20}
                    strokeWidth={3}
                  />
                  {data.totals.balanced ? 'The books balance' : 'The books do NOT balance'}
                </h2>
                <dl className="m-0 grid grid-cols-3 gap-3">
                  {[
                    ['Debits', formatKwacha(data.totals.debitsNgwee)],
                    ['Credits', formatKwacha(data.totals.creditsNgwee)],
                    ['Transactions', String(data.totals.transactionCount)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-0.5">
                      <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                        {k}
                      </dt>
                      <dd className="display tabular m-0 text-xl">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section aria-labelledby="accounts-title" className="flex flex-col gap-3">
                <h2 id="accounts-title" className="display m-0 text-xl">
                  Accounts
                </h2>
                {data.accounts.length === 0 ? (
                  <p className="m-0 text-ink-3">No money has moved yet. Post a test donation.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col rounded-card border border-line bg-surface p-0">
                    {data.accounts.map((a, i) => (
                      <li
                        key={`${a.label}-${i}`}
                        className={`flex items-baseline justify-between gap-4 px-5 py-3.5 ${i > 0 ? 'border-t border-line' : ''}`}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{a.label}</span>
                          <span className="text-xs text-ink-3">
                            {a.normal === 'credit'
                              ? 'Owed by Fundizo (grows with credits)'
                              : 'Held or spent (grows with debits)'}
                          </span>
                        </span>
                        <span className="tabular shrink-0 font-semibold">
                          {money(a.balanceNgwee)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside className="flex min-w-0 flex-col gap-6">
              <section
                aria-labelledby="test-title"
                className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5"
              >
                <div className="flex flex-col gap-1">
                  <h2 id="test-title" className="display m-0 text-xl">
                    Pretend donation
                  </h2>
                  <p className="m-0 text-sm text-ink-2">
                    Skips payment (that’s slice 6) and posts the money straight to the ledger.
                  </p>
                </div>
                <TestDonationForm campaigns={data.campaigns} />
              </section>

              {data.campaigns.length > 0 ? (
                <section aria-labelledby="raised-title" className="flex flex-col gap-3">
                  <h2 id="raised-title" className="display m-0 text-xl">
                    Raised (from the ledger)
                  </h2>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {data.campaigns.map((c) => (
                      <li key={c.slug}>
                        <Link
                          href={`/f/${c.slug}`}
                          className="flex items-baseline justify-between gap-3 rounded-control border border-line bg-surface px-4 py-3 text-ink no-underline hover:border-accent"
                        >
                          <span className="truncate">{c.title}</span>
                          <span className="tabular shrink-0 font-semibold">
                            {money(c.raisedNgwee)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section aria-labelledby="jobs-title" className="flex flex-col gap-3">
                <h2 id="jobs-title" className="display m-0 text-xl">
                  Background jobs
                </h2>
                {!data.jobs.enabled ? (
                  <p className="m-0 text-ink-3">Jobs are switched off (JOBS_ENABLED=false).</p>
                ) : (
                  <dl className="m-0 grid grid-cols-2 gap-2 rounded-card border border-line bg-surface p-4 text-sm">
                    {[
                      ['Waiting in outbox', data.jobs.outbox.waiting],
                      ['Relayed', data.jobs.outbox.relayed],
                      ...Object.entries(data.jobs.queue ?? {}).map(
                        ([k, v]) => [`Jobs ${k}`, v] as const,
                      ),
                    ].map(([k, v]) => (
                      <div key={String(k)} className="flex flex-col">
                        <dt className="text-ink-3">{k}</dt>
                        <dd className="tabular m-0 font-semibold">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            </aside>
          </div>

          <section aria-labelledby="recent-title" className="flex flex-col gap-3">
            <h2 id="recent-title" className="display m-0 text-xl">
              Latest transactions
            </h2>
            {data.recent.length === 0 ? (
              <p className="m-0 text-ink-3">None yet.</p>
            ) : (
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                {data.recent.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
                  >
                    <span className="text-xs text-ink-3">
                      {t.kind} · {t.refType} · {time(t.createdAt)}
                    </span>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="text-left text-xs text-ink-3">
                          <th className="pb-1 font-medium">Account</th>
                          <th className="w-24 pb-1 pl-3 text-right font-medium">Debit</th>
                          <th className="w-24 pb-1 pl-3 text-right font-medium">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.lines.map((l, i) => (
                          <tr key={i} className="border-t border-line">
                            <td className="py-1.5 pr-2">{l.account}</td>
                            <td className="tabular py-1.5 pl-3 text-right">
                              {l.debitNgwee ? formatKwacha(l.debitNgwee) : ''}
                            </td>
                            <td className="tabular py-1.5 pl-3 text-right">
                              {l.creditNgwee ? formatKwacha(l.creditNgwee) : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
