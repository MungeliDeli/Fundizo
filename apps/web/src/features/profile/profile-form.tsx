'use client';

import {
  LANGUAGES,
  type Language,
  PROVINCES,
  type PublicUser,
  SessionResponse,
  UpdateProfileRequest,
} from '@fundizo/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { ApiError, apiPatch, fieldErrors } from '@/lib/api';
import { formError } from '@/features/auth/error-messages';

type Values = {
  firstName: string;
  lastName: string;
  province: string;
  district: string;
  language: Language;
};

/** Edit name, where you are, and language (A-02). */
export function ProfileForm({ user }: { user: PublicUser }) {
  const router = useRouter();
  const initial: Values = {
    firstName: user.firstName,
    lastName: user.lastName,
    province: user.province ?? '',
    district: user.district ?? '',
    language: user.language,
  };
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const set =
    (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setStatus(null);
    };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = UpdateProfileRequest.safeParse({ ...values, province: values.province || null });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await apiPatch('/me/profile', parsed.data, SessionResponse);
      setStatus({ tone: 'success', text: 'Saved.' });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      setStatus({ tone: 'error', text: formError(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
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
        <SelectField
          label="Province"
          value={values.province}
          onChange={set('province')}
          error={errors.province}
        >
          <option value="">Choose a province</option>
          {PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Town or district"
          placeholder="e.g. Kabwe"
          autoComplete="address-level2"
          value={values.district}
          onChange={set('district')}
          error={errors.district}
          maxLength={60}
        />
      </div>
      <SelectField
        label="Language for emails and texts"
        value={values.language}
        onChange={set('language')}
        error={errors.language}
        hint="Fundizo is in English for now. We’ll use your choice as soon as translations arrive."
      >
        {Object.entries(LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </SelectField>
      <p className="m-0 text-sm text-ink-3">
        Your name and town appear on fundraisers you organise, so donors know who they’re giving to.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="md" loading={saving} disabled={!dirty}>
          Save changes
        </Button>
        {status ? (
          status.tone === 'success' ? (
            <span role="status" className="text-sm font-semibold text-good">
              {status.text}
            </span>
          ) : (
            <Alert tone="error" className="w-full">
              {status.text}
            </Alert>
          )
        ) : null}
      </div>
    </form>
  );
}
