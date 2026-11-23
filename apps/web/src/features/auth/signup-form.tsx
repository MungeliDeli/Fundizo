'use client';

import { AcceptedResponse, PASSWORD_MIN, SignupRequest } from '@fundizo/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PasswordField, TextField } from '@/components/ui/text-field';
import { ApiError, apiPost, fieldErrors } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formError, rememberPendingEmail } from './error-messages';

const EMPTY = { firstName: '', lastName: '', email: '', password: '' };

/** Sign up with name, email and password (A-01). Next step: the email code screen. */
export function SignupForm() {
  const router = useRouter();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    const parsed = SignupRequest.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/auth/signup', parsed.data, AcceptedResponse);
      rememberPendingEmail(parsed.data.email);
      router.push('/verify-email');
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      setFormErr(formError(err));
      setSubmitting(false);
    }
  }

  const longEnough = values.password.length >= PASSWORD_MIN;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formErr ? <Alert tone="error">{formErr}</Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="First name"
          autoComplete="given-name"
          value={values.firstName}
          onChange={set('firstName')}
          error={errors.firstName}
          maxLength={60}
        />
        <TextField
          label="Last name"
          autoComplete="family-name"
          value={values.lastName}
          onChange={set('lastName')}
          error={errors.lastName}
          maxLength={60}
        />
      </div>
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={values.email}
        onChange={set('email')}
        error={errors.email}
        maxLength={254}
      />
      <PasswordField
        label="Password"
        autoComplete="new-password"
        value={values.password}
        onChange={set('password')}
        error={errors.password}
        maxLength={128}
        hint={
          <span className={cn('inline-flex items-center gap-1.5', longEnough && 'text-good')}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {longEnough ? <path d="M20 6 9 17l-5-5" /> : <circle cx="12" cy="12" r="8" />}
            </svg>
            At least {PASSWORD_MIN} characters. A short sentence works well.
          </span>
        }
      />
      <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
        Create account
      </Button>
      <p className="m-0 text-center text-xs text-ink-3">
        We’ll email you a 6-digit code to confirm it’s you.
      </p>
    </form>
  );
}
