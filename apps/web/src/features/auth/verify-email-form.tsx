'use client';

import {
  AcceptedResponse,
  EMAIL_CODE_LENGTH,
  Email,
  SessionResponse,
  VerifyEmailRequest,
} from '@fundizo/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { apiPost } from '@/lib/api';
import { cn } from '@/lib/cn';
import { clearPendingEmail, formError, readPendingEmail } from './error-messages';

const RESEND_COOLDOWN_S = 60;
const noopSubscribe = () => () => {};

interface Props {
  /** From the link in the email (?email=…&code=…). */
  initialEmail?: string;
  initialCode?: string;
  /** Came from login with an unverified account: we already sent a fresh code. */
  resent?: boolean;
}

/** Enter the 6-digit code from the email (A-01). The right code verifies and signs you in. */
export function VerifyEmailForm({ initialEmail = '', initialCode = '', resent = false }: Props) {
  const router = useRouter();
  const codeId = useId();
  // Email from the sign-up screen (sessionStorage, never the URL). Server render sees ''.
  const storedEmail = useSyncExternalStore(noopSubscribe, readPendingEmail, () => '');
  const [typedEmail, setTypedEmail] = useState('');
  const email = initialEmail || storedEmail || typedEmail;
  const emailKnown = Boolean(initialEmail || storedEmail);

  const [code, setCode] = useState(initialCode.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    resent ? 'We sent a new code to your email.' : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(resent ? RESEND_COOLDOWN_S : 0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(withCode = code) {
    setError(null);
    const parsed = VerifyEmailRequest.safeParse({ email, code: withCode });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the code and try again.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/auth/verify-email', parsed.data, SessionResponse);
      clearPendingEmail();
      router.replace('/account?welcome=1');
      router.refresh();
    } catch (err) {
      setError(formError(err));
      setSubmitting(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    if (!Email.safeParse(email).success) {
      setError('Enter the email you signed up with.');
      return;
    }
    try {
      await apiPost('/auth/resend-verification', { email }, AcceptedResponse);
      setNotice('If that email is waiting for a code, a new one is on its way.');
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(formError(err));
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {emailKnown ? (
        <p className="m-0 rounded-control bg-sunk px-4 py-3 text-sm text-ink-2">
          Code sent to <strong className="break-all text-ink">{email}</strong>.{' '}
          <Link href="/signup" className="font-semibold text-accent-ink">
            Wrong email?
          </Link>
        </p>
      ) : (
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={typedEmail}
          onChange={(e) => setTypedEmail(e.target.value)}
        />
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={codeId} className="text-sm font-semibold">
          6-digit code
        </label>
        <input
          id={codeId}
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
            setCode(digits);
            // Typed or pasted the full code: confirm straight away.
            if (digits.length === EMAIL_CODE_LENGTH && email) void verify(digits);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={EMAIL_CODE_LENGTH}
          placeholder="••••••"
          aria-describedby={`${codeId}-hint`}
          className={cn(
            'display h-16 w-full rounded-control border bg-surface text-center text-3xl tracking-[0.5em] text-ink outline-none',
            'placeholder:text-line focus:border-ink focus:ring-4 focus:ring-accent/15',
            error ? 'border-bad' : 'border-line',
          )}
        />
        <p id={`${codeId}-hint`} className="m-0 text-sm text-ink-3">
          The code expires in 15 minutes. Check your spam folder if you can’t see it.
        </p>
      </div>

      <Button type="submit" size="lg" loading={submitting} className="w-full">
        Confirm email
      </Button>
      <Button
        variant="ghost"
        onClick={resend}
        disabled={cooldown > 0}
        className="self-center text-sm"
      >
        {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
      </Button>
    </form>
  );
}
