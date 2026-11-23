'use client';

import { type Beneficiary, CreateCampaignRequest, OwnCampaignResponse } from '@fundizo/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ApiError, apiPost } from '@/lib/api';
import { formError } from '@/features/auth/error-messages';
import { ChoiceCard } from './choice-card';
import { stepHref } from './steps';
import { useSaveDraft } from './use-save-draft';

/** Step 1 (C-02): raising for yourself, or for someone else. Creates the draft on first Continue. */
export function StepWho({
  campaignId,
  initial,
}: {
  campaignId: string | null;
  initial: Beneficiary | null;
}) {
  const router = useRouter();
  const draft = useSaveDraft(campaignId);
  const [kind, setKind] = useState<Beneficiary['kind']>(initial?.kind ?? 'self');
  const other = initial?.kind === 'someone_else' ? initial : null;
  const [name, setName] = useState(other?.name ?? '');
  const [relationship, setRelationship] = useState(other?.relationship ?? '');
  const [phone, setPhone] = useState(other?.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const beneficiary =
      kind === 'self' ? { kind } : { kind, name, relationship, phone: phone.trim() ? phone : null };
    const parsed = CreateCampaignRequest.safeParse({ beneficiary });
    if (!parsed.success) {
      // Errors arrive as beneficiary.name etc.; show them on the fields.
      const out: Record<string, string> = {};
      for (const issue of parsed.error.issues) out[String(issue.path.at(-1))] ??= issue.message;
      setErrors(out);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      let id = campaignId;
      if (id) {
        if (!(await draft.save({ beneficiary: parsed.data.beneficiary }))) return;
      } else {
        id = (await apiPost('/campaigns', parsed.data, OwnCampaignResponse)).campaign.id;
      }
      router.push(stepHref(id, 'category'));
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      setError(formError(err));
    } finally {
      setBusy(false);
    }
  }

  const shownError = error ?? draft.error;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {shownError ? <Alert tone="error">{shownError}</Alert> : null}
      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only">Who is this fundraiser for?</legend>
        <ChoiceCard
          name="who"
          value="self"
          checked={kind === 'self'}
          onChange={() => setKind('self')}
          icon="user"
          label="Myself"
          hint="The money comes to you."
        />
        <ChoiceCard
          name="who"
          value="someone_else"
          checked={kind === 'someone_else'}
          onChange={() => setKind('someone_else')}
          icon="users"
          label="Someone else"
          hint="A family member, friend or neighbour."
        />
      </fieldset>

      {kind === 'someone_else' ? (
        <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 md:p-6">
          <TextField
            label="Their full name"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            maxLength={120}
          />
          <TextField
            label="How do you know them?"
            placeholder="e.g. mother, friend, church member"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            error={errors.relationship}
            maxLength={40}
          />
          <TextField
            label="Their phone number (optional)"
            type="tel"
            inputMode="tel"
            placeholder="096 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
            hint="Later we’ll text them to confirm they know about the fundraiser. Never shown publicly."
          />
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        loading={busy || draft.saving}
        className="w-full sm:w-auto sm:self-start sm:px-10"
      >
        Continue
      </Button>
    </form>
  );
}
