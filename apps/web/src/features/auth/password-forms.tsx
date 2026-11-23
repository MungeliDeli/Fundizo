'use client';

import {
  AcceptedResponse,
  EmailOnlyRequest,
  PASSWORD_MIN,
  ResetPasswordRequest,
  SessionResponse,
} from '@fundizo/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { PasswordField, TextField } from '@/components/ui/text-field';
import { apiPost } from '@/lib/api';
import { formError } from './error-messages';

/** Ask for a reset link. Also how a Google-only account sets its first password (ADR 0004). */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = EmailOnlyRequest.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter your email.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/auth/password/forgot', parsed.data, AcceptedResponse);
      setSentTo(parsed.data.email);
    } catch (err) {
      setError(formError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-5">
        <Alert tone="success">
          If there’s a Fundizo account for <strong className="break-all">{sentTo}</strong>, we’ve
          sent it a link to set a new password. The link works once and expires in 30 minutes.
        </Alert>
        <ButtonLink href="/login" variant="outline" className="w-full">
          Back to log in
        </ButtonLink>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" size="lg" loading={submitting} className="w-full">
        Email me a link
      </Button>
    </form>
  );
}

/** Choose a new password from the emailed link. Signs you in and logs out other devices. */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <div className="flex flex-col gap-5">
        <Alert tone="error">
          This link is incomplete. Open the newest email from us, or ask for a new link.
        </Alert>
        <ButtonLink href="/forgot-password" className="w-full">
          Get a new link
        </ButtonLink>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = ResetPasswordRequest.safeParse({ token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your new password.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/auth/password/reset', parsed.data, SessionResponse);
      router.replace('/account?password=changed');
      router.refresh();
    } catch (err) {
      setError(formError(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error ? (
        <Alert tone="error">
          {error}{' '}
          <Link href="/forgot-password" className="font-semibold underline">
            Get a new link
          </Link>
        </Alert>
      ) : null}
      <PasswordField
        label="New password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={`At least ${PASSWORD_MIN} characters. You’ll be logged out on your other devices.`}
      />
      <Button type="submit" size="lg" loading={submitting} className="w-full">
        Save password and log in
      </Button>
    </form>
  );
}
