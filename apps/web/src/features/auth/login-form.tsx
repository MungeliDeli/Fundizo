'use client';

import { LoginRequest, SessionResponse } from '@fundizo/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PasswordField, TextField } from '@/components/ui/text-field';
import { ApiError, apiPost, fieldErrors } from '@/lib/api';
import { formError, rememberPendingEmail } from './error-messages';

/** Log in with email and password (A-01, A-03). */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    const parsed = LoginRequest.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await apiPost('/auth/login', parsed.data, SessionResponse);
      router.replace(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_not_verified') {
        rememberPendingEmail(parsed.data.email);
        router.push('/verify-email?resent=1');
        return;
      }
      setFormErr(formError(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formErr ? <Alert tone="error">{formErr}</Alert> : null}
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={values.email}
        onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        error={errors.email}
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        value={values.password}
        onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
        error={errors.password}
        labelAside={
          <Link href="/forgot-password" className="text-sm font-semibold text-accent-ink">
            Forgot password?
          </Link>
        }
      />
      <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
        Log in
      </Button>
    </form>
  );
}
