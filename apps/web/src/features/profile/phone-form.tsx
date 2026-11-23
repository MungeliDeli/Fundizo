'use client';

import {
  AcceptedResponse,
  NETWORK_NAME,
  PHONE_CODE_LENGTH,
  SendPhoneCodeRequest,
  SessionResponse,
  VerifyPhoneRequest,
  detectNetwork,
  formatLocalMobile,
} from '@fundizo/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { apiPost } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formError } from '@/features/auth/error-messages';

const RESEND_COOLDOWN_S = 60;
type Step = { kind: 'view' } | { kind: 'enter' } | { kind: 'code'; phone: string };

/** Add or change your phone number, confirmed by an SMS code (A-13). */
export function PhoneForm({ phone }: { phone: string | null }) {
  const router = useRouter();
  const codeId = useId();
  const [step, setStep] = useState<Step>(phone ? { kind: 'view' } : { kind: 'enter' });
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const network = detectNetwork(number);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const parsed = SendPhoneCodeRequest.safeParse({ phone: number });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the number.');
      return;
    }
    setBusy(true);
    try {
      await apiPost('/me/phone/code', parsed.data, AcceptedResponse);
      setStep({ kind: 'code', phone: parsed.data.phone });
      setCode('');
      setNotice(`We texted a code to ${formatLocalMobile(parsed.data.phone)}.`);
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(formError(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(target: string, withCode: string) {
    setError(null);
    const parsed = VerifyPhoneRequest.safeParse({ phone: target, code: withCode });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the code.');
      return;
    }
    setBusy(true);
    try {
      await apiPost('/me/phone/verify', parsed.data, SessionResponse);
      setStep({ kind: 'view' });
      setNotice('Your phone number is confirmed.');
      setNumber('');
      router.refresh();
    } catch (err) {
      setError(formError(err));
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === 'view' && phone) {
    return (
      <div className="flex flex-col gap-4">
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-4 py-3">
          <div className="flex flex-col">
            <span className="tabular font-semibold">{formatLocalMobile(phone)}</span>
            <span className="text-sm text-ink-3">
              {NETWORK_NAME[detectNetwork(phone) ?? 'MTN']} · only you can see this
            </span>
          </div>
          <span className="inline-flex h-6 items-center rounded-full bg-good-soft px-2 text-xs font-semibold text-good">
            Confirmed
          </span>
        </div>
        <Button
          variant="ghost"
          className="self-start text-sm"
          onClick={() => {
            setNotice(null);
            setStep({ kind: 'enter' });
          }}
        >
          Use a different number
        </Button>
      </div>
    );
  }

  if (step.kind === 'code') {
    return (
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void verify(step.phone, code);
        }}
      >
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : notice ? (
          <Alert tone="success">{notice}</Alert>
        ) : null}
        <div className="flex flex-col gap-2">
          <label htmlFor={codeId} className="text-sm font-semibold">
            6-digit code from the text
          </label>
          <input
            id={codeId}
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, PHONE_CODE_LENGTH);
              setCode(digits);
              if (digits.length === PHONE_CODE_LENGTH) void verify(step.phone, digits);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={PHONE_CODE_LENGTH}
            placeholder="••••••"
            className={cn(
              'display h-16 w-full rounded-control border bg-surface text-center text-3xl tracking-[0.5em] text-ink outline-none',
              'placeholder:text-line focus:border-ink focus:ring-4 focus:ring-accent/15',
              error ? 'border-bad' : 'border-line',
            )}
          />
          <p className="m-0 text-sm text-ink-3">The code expires in 10 minutes.</p>
        </div>
        <Button type="submit" size="lg" loading={busy} className="w-full">
          Confirm number
        </Button>
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            className="text-sm"
            disabled={cooldown > 0 || busy}
            onClick={() => void sendCode()}
          >
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
          </Button>
          <Button
            variant="ghost"
            className="text-sm"
            onClick={() => {
              setError(null);
              setNotice(null);
              setStep({ kind: 'enter' });
            }}
          >
            Change number
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={sendCode} className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <TextField
        label="Mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="096 123 4567"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        className="tabular pr-24"
        hint="MTN, Airtel or Zamtel. We’ll text you a 6-digit code. Never shown to donors."
        end={
          network ? (
            <span
              className="rounded-md bg-sunk px-2 py-1 text-xs font-bold text-ink"
              aria-live="polite"
            >
              {NETWORK_NAME[network]}
            </span>
          ) : null
        }
      />
      <Button type="submit" size="lg" loading={busy} className="w-full">
        {network ? `Text a code to my ${NETWORK_NAME[network]} number` : 'Text me a code'}
      </Button>
      {phone ? (
        <Button
          variant="ghost"
          className="self-start text-sm"
          onClick={() => setStep({ kind: 'view' })}
        >
          Keep {formatLocalMobile(phone)}
        </Button>
      ) : null}
    </form>
  );
}
