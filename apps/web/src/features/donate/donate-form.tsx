'use client';

import {
  CreateDonationRequest,
  CreateDonationResponse,
  DEFAULT_TIP_PERCENT,
  DONATION_MESSAGE_MAX,
  DONOR_NAME_MAX,
  IDEMPOTENCY_HEADER,
  QUICK_AMOUNTS_NGWEE,
  TIP_PERCENTS,
  detectNetwork,
  formatKwacha,
  parseKwachaInput,
  suggestedTip,
} from '@fundizo/shared';
import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { formError } from '@/features/auth/error-messages';
import { ApiError, apiPost, fieldErrors } from '@/lib/api';
import { cn } from '@/lib/cn';
import { donorMemory } from './device-memory';
import { NETWORK_LABEL, NetworkBadge } from './network-badge';

type Tip = { kind: 'percent'; percent: number } | { kind: 'custom'; text: string };

/**
 * The donate sheet (D-01 – D-03, D-05, D-10): amount, tip, number, name or anonymous, message.
 * One prompt covers gift + tip. Validated with the same schema as the API.
 */
export function DonateForm({ slug, beneficiary }: { slug: string; beneficiary: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState<number | 'other'>(QUICK_AMOUNTS_NGWEE[1] ?? 10_000);
  const [otherText, setOtherText] = useState('');
  const [tip, setTip] = useState<Tip>({ kind: 'percent', percent: DEFAULT_TIP_PERCENT });
  // Remembered on this device (D-05); the server render sees ''. Typing replaces the stored value.
  const storedPhone = useSyncExternalStore(noopSubscribe, donorMemory.phone, () => '');
  const storedName = useSyncExternalStore(noopSubscribe, donorMemory.name, () => '');
  const [typedPhone, setPhone] = useState<string | null>(null);
  const [typedName, setName] = useState<string | null>(null);
  const phone = typedPhone ?? storedPhone;
  const name = typedName ?? storedName;
  const [anonymous, setAnonymous] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per intended payment: a double tap or a network retry reuses it (no double charge).
  const key = useRef<{ key: string; body: string } | null>(null);

  const amountNgwee = amount === 'other' ? (parseKwachaInput(otherText) ?? 0) : amount;
  const tipNgwee =
    tip.kind === 'percent'
      ? suggestedTip(amountNgwee, tip.percent)
      : tip.text.trim() === ''
        ? 0
        : (parseKwachaInput(tip.text) ?? -1);
  const total = amountNgwee + Math.max(0, tipNgwee);
  const network = detectNetwork(phone);
  const payNetwork = network === 'MTN' || network === 'AIRTEL' ? network : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    const body = {
      campaignSlug: slug,
      amountNgwee,
      tipNgwee,
      phone,
      anonymous,
      donorName: anonymous ? undefined : name.trim() || undefined,
      message: message.trim() || undefined,
    };
    const parsed = CreateDonationRequest.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    const fingerprint = JSON.stringify(parsed.data);
    if (key.current?.body !== fingerprint)
      key.current = { key: crypto.randomUUID(), body: fingerprint };
    setBusy(true);
    try {
      const res = await apiPost('/donations', parsed.data, CreateDonationResponse, {
        headers: { [IDEMPOTENCY_HEADER]: key.current.key },
      });
      donorMemory.remember(phone, anonymous ? '' : name.trim());
      donorMemory.saveToken(res.donation.id, res.accessToken);
      router.push(`/f/${slug}/give/${res.donation.id}`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      setFormErr(formError(err));
      setBusy(false);
    }
  }

  const chip = (on: boolean) =>
    cn(
      'tabular h-13 rounded-control text-base font-semibold transition',
      on
        ? 'border-[1.5px] border-accent bg-accent-soft text-accent-ink'
        : 'border border-line bg-surface text-ink hover:border-ink-3',
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-7">
      {formErr ? <Alert tone="error">{formErr}</Alert> : null}

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <div className="flex items-baseline justify-between gap-3">
          <legend className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">
            Your gift
          </legend>
          <span className="display tabular text-3xl" aria-live="polite">
            {formatKwacha(amountNgwee)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {QUICK_AMOUNTS_NGWEE.map((v) => (
            <button
              key={v}
              type="button"
              className={chip(amount === v)}
              aria-pressed={amount === v}
              onClick={() => setAmount(v)}
            >
              {formatKwacha(v)}
            </button>
          ))}
          <button
            type="button"
            aria-label="Other amount"
            className={chip(amount === 'other')}
            aria-pressed={amount === 'other'}
            onClick={() => setAmount('other')}
          >
            Other
          </button>
        </div>
        {amount === 'other' ? (
          <TextField
            label="Amount in kwacha"
            inputMode="numeric"
            autoFocus
            placeholder="e.g. 150"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            error={errors.amountNgwee}
            hint="Whole kwacha, from K5."
          />
        ) : errors.amountNgwee ? (
          <p className="m-0 text-sm text-bad">{errors.amountNgwee}</p>
        ) : null}
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <div className="flex items-baseline justify-between gap-3">
          <legend className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">
            Tip for Fundizo
          </legend>
          <span className="tabular text-sm font-semibold">
            {formatKwacha(Math.max(0, tipNgwee))}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1 rounded-control bg-sunk p-1">
          {TIP_PERCENTS.map((p) => {
            const on = tip.kind === 'percent' && tip.percent === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => setTip({ kind: 'percent', percent: p })}
                className={cn(
                  'h-10 rounded-[10px] text-sm font-semibold',
                  on ? 'bg-surface text-ink shadow-sm' : 'text-ink-2',
                )}
              >
                {p}%
              </button>
            );
          })}
          <button
            type="button"
            aria-label="Other tip"
            aria-pressed={tip.kind === 'custom'}
            onClick={() => setTip({ kind: 'custom', text: '' })}
            className={cn(
              'h-10 rounded-[10px] text-sm font-semibold',
              tip.kind === 'custom' ? 'bg-surface text-ink shadow-sm' : 'text-ink-2',
            )}
          >
            Other
          </button>
        </div>
        {tip.kind === 'custom' ? (
          <TextField
            label="Tip in kwacha"
            inputMode="numeric"
            value={tip.text}
            onChange={(e) => setTip({ kind: 'custom', text: e.target.value })}
            error={tipNgwee < 0 ? 'Whole kwacha, or leave it empty for no tip.' : errors.tipNgwee}
          />
        ) : null}
        <p className="m-0 text-sm text-ink-3">
          Organisers pay nothing. Tips keep Fundizo running. Set it to 0% any time.
        </p>
      </fieldset>

      <TextField
        label="Mobile money number"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="096 123 4567"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        hint="We’ll send a payment prompt to this phone. MTN MoMo or Airtel Money."
        className={payNetwork ? 'pr-24 text-lg' : 'text-lg'}
        end={payNetwork ? <NetworkBadge network={payNetwork} /> : null}
      />

      <div className="flex flex-col gap-3">
        <TextField
          label="Name on the donor wall"
          autoComplete="name"
          maxLength={DONOR_NAME_MAX}
          disabled={anonymous}
          value={anonymous ? 'Anonymous' : name}
          onChange={(e) => setName(e.target.value)}
          error={anonymous ? undefined : errors.donorName}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-base">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="size-5 accent-[var(--color-accent)]"
            />
            Give anonymously
          </label>
          {!showMessage ? (
            <button
              type="button"
              onClick={() => setShowMessage(true)}
              className="min-h-11 text-sm font-semibold text-accent-ink"
            >
              + Add a message
            </button>
          ) : null}
        </div>
        {showMessage ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="donation-message" className="text-sm font-semibold">
              Message for {beneficiary}{' '}
              <span className="font-normal text-ink-3">(optional, shown publicly)</span>
            </label>
            <textarea
              id="donation-message"
              rows={3}
              maxLength={DONATION_MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-control border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-ink focus:ring-4 focus:ring-accent/15"
            />
            <span className="self-end text-xs text-ink-3">
              {message.length}/{DONATION_MESSAGE_MAX}
            </span>
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2.5 border-t border-line bg-surface px-4 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:rounded-card sm:border sm:p-5">
        <div className="flex justify-between gap-3 text-sm text-ink-2">
          <span>
            {formatKwacha(amountNgwee)} gift · {formatKwacha(Math.max(0, tipNgwee))} tip
          </span>
          <span className="tabular font-semibold text-ink">Total {formatKwacha(total)}</span>
        </div>
        <Button type="submit" size="lg" loading={busy} className="w-full">
          {payNetwork
            ? `Pay ${formatKwacha(total)} with ${NETWORK_LABEL[payNetwork]}`
            : `Pay ${formatKwacha(total)}`}
        </Button>
        <p className="m-0 text-center text-xs text-ink-3">
          You approve it on your phone with your PIN. Fundizo never asks for your PIN.
        </p>
      </div>
    </form>
  );
}

const noopSubscribe = () => () => {};
