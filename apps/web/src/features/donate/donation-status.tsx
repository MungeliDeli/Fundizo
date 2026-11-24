'use client';

import {
  DEV_PAYMENT_OUTCOMES,
  DONATION_TOKEN_HEADER,
  DonationResponse,
  type DonationView,
  FAILURE_TEXT,
  IDEMPOTENCY_HEADER,
  PublicCampaignResponse,
  formatKwacha,
  progressPercent,
} from '@fundizo/shared';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { formError } from '@/features/auth/error-messages';
import { ShareActions } from '@/features/campaigns/public/share-actions';
import { apiGet, apiPost } from '@/lib/api';
import { donorMemory } from './device-memory';
import { NETWORK_LABEL } from './network-badge';

/**
 * After "Pay": waiting for the PIN (D-08), then the result (D-09). Polls the API every 2 s while the
 * payment is open (WebSockets can come later; ADR 0007). `unknown` is never shown as success.
 */
export function DonationStatus({ donationId, slug }: { donationId: string; slug: string }) {
  // The access token lives on this device only. Server render: undefined (still loading).
  const token = useSyncExternalStore(
    noopSubscribe,
    () => donorMemory.token(donationId),
    () => undefined,
  );
  const [d, setD] = useState<DonationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const waiting = d?.status === 'pending';

  // Load now, then keep polling while the payment is open (every 2 s; 10 s once it's unknown).
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await apiGet(`/donations/${donationId}`, DonationResponse, {
          headers: { [DONATION_TOKEN_HEADER]: token },
          cache: 'no-store',
        });
        if (stopped) return;
        setD(res.donation);
        setError(null);
        const open = res.donation.status === 'pending' || res.donation.status === 'unknown';
        if (open)
          timer = setTimeout(() => void tick(), res.donation.status === 'unknown' ? 10_000 : 2_000);
      } catch (err) {
        if (stopped) return;
        setError(formError(err));
        timer = setTimeout(() => void tick(), 5_000);
      }
    };
    timer = setTimeout(() => void tick(), 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // A retry puts the status back to pending: restart polling then.
  }, [donationId, token, waiting]);

  if (token === null) {
    return (
      <Centered>
        <h1 className="display m-0 text-3xl">We can’t show this gift here</h1>
        <p className="m-0 text-ink-2">
          For your privacy, a gift’s progress only shows on the phone or browser that started it. If
          you approved the payment, you’ll get a receipt by SMS.
        </p>
        <ButtonLink href={`/f/${slug}`} variant="outline">
          Back to the fundraiser
        </ButtonLink>
      </Centered>
    );
  }
  if (!d) {
    return (
      <Centered>
        {error ? <Alert tone="error">{error}</Alert> : <p className="text-ink-3">Loading…</p>}
      </Centered>
    );
  }

  if (d.status === 'pending') return <Waiting d={d} />;
  if (d.status === 'successful') return <ThankYou d={d} />;
  if (d.status === 'unknown') return <NotYetConfirmed d={d} />;
  return <Failed d={d} onRetried={setD} token={token ?? ''} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-lg flex-col gap-5 py-6">{children}</div>;
}

function useCountdown(until: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

function Waiting({ d }: { d: DonationView }) {
  const left = useCountdown(d.promptExpiresAt);
  const steps = [
    {
      text: d.promptSent ? 'Prompt sent to your phone' : 'Sending the prompt…',
      state: d.promptSent ? 'done' : 'now',
    },
    { text: 'Enter your PIN to approve', state: d.promptSent ? 'now' : 'next' },
    { text: 'We confirm it here automatically', state: 'next' },
  ] as const;
  return (
    <Centered>
      <p className="m-0 flex items-center justify-center gap-2 text-sm text-ink-2" role="status">
        <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
        Waiting for {NETWORK_LABEL[d.network]}
      </p>
      <PhoneIllustration amount={formatKwacha(d.totalNgwee)} />
      <div className="flex flex-col gap-2 text-center">
        <h1 className="display m-0 text-3xl">Check your phone</h1>
        <p className="m-0 text-lg text-ink-2">
          Enter your PIN on <strong className="tabular text-ink">{d.phone}</strong> to approve{' '}
          <strong className="text-ink">{formatKwacha(d.totalNgwee)}</strong>.
        </p>
      </div>
      <ol className="m-0 flex list-none flex-col rounded-card border border-line bg-surface p-0">
        {steps.map((s, i) => (
          <li
            key={s.text}
            className={`flex items-center gap-3 px-4 py-3.5 ${i ? 'border-t border-line' : ''} ${s.state === 'next' ? 'text-ink-3' : ''}`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                s.state === 'done'
                  ? 'bg-good-soft text-good'
                  : s.state === 'now'
                    ? 'bg-accent text-on-accent'
                    : 'bg-sunk text-ink-3'
              }`}
            >
              {s.state === 'done' ? <Icon name="check" size={14} strokeWidth={3} /> : i + 1}
            </span>
            {s.text}
          </li>
        ))}
      </ol>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="tabular m-0 text-sm text-ink-3">Prompt expires in {left}</p>
        <p className="m-0 text-sm text-ink-3">
          Didn’t get it? Keep your phone on with signal. If it expires, you can send it again here.
          Please don’t pay twice.
        </p>
      </div>
      {d.promptSent ? <DevNetworkPanel donationId={d.id} /> : null}
    </Centered>
  );
}

function ThankYou({ d }: { d: DonationView }) {
  const [c, setC] = useState<z.infer<typeof PublicCampaignResponse>['campaign'] | null>(null);
  useEffect(() => {
    apiGet(`/public/campaigns/${d.campaign.slug}`, PublicCampaignResponse, { cache: 'no-store' })
      .then((r) => setC(r.campaign))
      .catch(() => setC(null));
  }, [d.campaign.slug]);
  const remaining = c?.goalNgwee ? Math.max(0, c.goalNgwee - c.raisedNgwee) : null;
  return (
    <Centered>
      <span className="grid size-14 place-items-center rounded-full bg-good-soft text-good">
        <Icon name="check" size={28} strokeWidth={2.6} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="display m-0 text-4xl">Thank you{d.donorName ? `, ${d.donorName}` : ''}.</h1>
        <p className="m-0 text-lg text-ink-2">
          Your {formatKwacha(d.amountNgwee)} is with “{d.campaign.title}”.
        </p>
      </div>
      {c ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="display tabular text-2xl">{formatKwacha(c.raisedNgwee)}</span>
            {c.goalNgwee ? (
              <span className="text-sm text-ink-2">of {formatKwacha(c.goalNgwee)}</span>
            ) : null}
          </div>
          {c.goalNgwee ? (
            <div className="h-2 overflow-hidden rounded-full bg-sunk">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${progressPercent(c.raisedNgwee, c.goalNgwee)}%` }}
              />
            </div>
          ) : null}
          <p className="tabular m-0 text-right text-sm text-ink-3">Ref {d.reference}</p>
        </div>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="display m-0 text-xl">
          {remaining ? `Still ${formatKwacha(remaining)} to go` : 'Help it go further'}
        </h2>
        <p className="m-0 text-ink-2">
          Share it with one group that knows them: family, church or work.
        </p>
        <ShareActions title={d.campaign.title} path={`/f/${d.campaign.slug}`} />
      </section>
      <ButtonLink href={`/f/${d.campaign.slug}`} variant="outline">
        Back to the fundraiser
      </ButtonLink>
    </Centered>
  );
}

function NotYetConfirmed({ d }: { d: DonationView }) {
  return (
    <Centered>
      <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-ink">
        <Icon name="clock" size={28} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="display m-0 text-3xl">
          We’re confirming with {d.network === 'MTN' ? 'MTN' : 'Airtel'}
        </h1>
        <p className="m-0 text-lg text-ink-2">
          The network hasn’t given us a final answer yet.{' '}
          <strong className="text-ink">Please don’t pay again.</strong> If the money left your
          wallet, it will reach the fundraiser and this page will update.
        </p>
      </div>
      <p className="tabular m-0 text-sm text-ink-3">
        Ref {d.reference} · keep this for any questions
      </p>
      <ButtonLink href={`/f/${d.campaign.slug}`} variant="outline">
        Back to the fundraiser
      </ButtonLink>
      <DevNetworkPanel donationId={d.id} />
    </Centered>
  );
}

function Failed({
  d,
  token,
  onRetried,
}: {
  d: DonationView;
  token: string;
  onRetried: (d: DonationView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const expired = d.status === 'expired';

  async function retry() {
    key.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost(`/donations/${d.id}/attempts`, {}, DonationResponse, {
        headers: { [DONATION_TOKEN_HEADER]: token, [IDEMPOTENCY_HEADER]: key.current },
      });
      key.current = null;
      onRetried(res.donation);
    } catch (err) {
      setError(formError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <span className="grid size-14 place-items-center rounded-full bg-bad-soft text-bad">
        <Icon name={expired ? 'clock' : 'close'} size={28} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="display m-0 text-3xl">
          {expired ? 'The prompt expired' : 'The payment didn’t go through'}
        </h1>
        <p className="m-0 text-lg text-ink-2">
          {expired
            ? 'Nobody approved it in time, so no money moved.'
            : `${d.failureReason ? FAILURE_TEXT[d.failureReason] : 'The network declined it.'} No money moved.`}
        </p>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {d.canRetry ? (
        <Button size="lg" onClick={retry} loading={busy} className="w-full">
          {expired ? 'Send the prompt again' : `Try again: ${formatKwacha(d.totalNgwee)}`}
        </Button>
      ) : null}
      <Link
        href={`/f/${d.campaign.slug}/give`}
        className="self-center text-sm font-semibold text-accent-ink"
      >
        Use a different number or amount
      </Link>
    </Centered>
  );
}

function PhoneIllustration({ amount }: { amount: string }) {
  return (
    <div
      className="mx-auto flex h-56 w-40 items-center rounded-[30px] border-2 border-ink bg-surface p-3.5"
      aria-hidden="true"
    >
      <div className="flex w-full flex-col gap-2 rounded-2xl bg-sunk px-3 py-3.5">
        <p className="m-0 text-xs leading-snug text-ink-2">
          Pay <strong className="text-ink">{amount}</strong> to FUNDIZO?
        </p>
        <div className="flex justify-center gap-1.5 py-1.5">
          {[1, 1, 0, 0].map((f, i) => (
            <span
              key={i}
              className={`size-2.5 rounded-full ${f ? 'bg-ink' : 'border-[1.5px] border-ink-3'}`}
            />
          ))}
        </div>
        <span className="grid h-7 place-items-center rounded-lg bg-accent text-xs font-semibold text-on-accent">
          Enter PIN
        </span>
      </div>
    </div>
  );
}

const DEV_LABEL: Record<(typeof DEV_PAYMENT_OUTCOMES)[number], string> = {
  approve: 'Approve (PIN ok)',
  insufficient_funds: 'Not enough money',
  wrong_pin: 'Wrong PIN',
  cancelled: 'Cancelled',
  expire: 'Time out',
  ambiguous: 'Unclear answer',
};
const Ok = z.object({ ok: z.literal(true) });

/** Development only: play the pretend network from the waiting screen. Not rendered in production. */
function DevNetworkPanel({ donationId }: { donationId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  if (process.env.NODE_ENV === 'production') return null;
  return (
    <section
      className="flex flex-col gap-3 rounded-card border border-dashed border-ink-3 p-4"
      aria-label="Development: play the network"
    >
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-accent-ink">
        Development only · play the network
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DEV_PAYMENT_OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            onClick={async () => {
              try {
                await apiPost(`/dev/payments/donations/${donationId}/decide`, { outcome: o }, Ok);
                setMsg(`Network answered: ${DEV_LABEL[o]}. Fundizo will check the status now.`);
              } catch (err) {
                setMsg(formError(err));
              }
            }}
            className="h-10 rounded-control border border-line bg-surface px-2 text-sm font-semibold hover:border-ink-3"
          >
            {DEV_LABEL[o]}
          </button>
        ))}
      </div>
      {msg ? <p className="m-0 text-sm text-ink-2">{msg}</p> : null}
    </section>
  );
}

const noopSubscribe = () => () => {};
