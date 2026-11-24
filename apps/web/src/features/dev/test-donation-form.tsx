'use client';

import { parseKwachaInput } from '@fundizo/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { formError } from '@/features/auth/error-messages';
import { apiPost } from '@/lib/api';

const Ok = z.object({ ok: z.literal(true) });

/** Development only: post a pretend, already-paid donation straight to the ledger. */
export function TestDonationForm({
  campaigns,
}: {
  campaigns: Array<{ slug: string; title: string }>;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(campaigns[0]?.slug ?? '');
  const [amount, setAmount] = useState('250');
  const [tip, setTip] = useState('15');
  const [network, setNetwork] = useState<'MTN' | 'AIRTEL'>('MTN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (campaigns.length === 0) {
    return (
      <p className="m-0 text-ink-3">
        Publish a fundraiser first, then you can post test donations to it.
      </p>
    );
  }

  const amountNgwee = parseKwachaInput(amount);
  const tipNgwee = tip.trim() === '' ? 0 : parseKwachaInput(tip);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amountNgwee || tipNgwee === null) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await apiPost(
        '/dev/ledger/test-donation',
        { campaignSlug: slug, amountNgwee, tipNgwee, network },
        Ok,
      );
      setDone(`Posted K${amount}${tipNgwee ? ` + K${tip} tip` : ''} via ${network}.`);
      router.refresh();
    } catch (err) {
      setError(formError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      <SelectField label="Fundraiser" value={slug} onChange={(e) => setSlug(e.target.value)}>
        {campaigns.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.title}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Donation (K)"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={amountNgwee ? undefined : 'Whole kwacha, e.g. 250'}
        />
        <TextField
          label="Tip (K)"
          inputMode="numeric"
          value={tip}
          onChange={(e) => setTip(e.target.value)}
          error={tipNgwee === null ? 'Whole kwacha or empty' : undefined}
        />
      </div>
      <SelectField
        label="Network"
        value={network}
        onChange={(e) => setNetwork(e.target.value === 'AIRTEL' ? 'AIRTEL' : 'MTN')}
      >
        <option value="MTN">MTN MoMo</option>
        <option value="AIRTEL">Airtel Money</option>
      </SelectField>
      <Button type="submit" loading={busy} disabled={!amountNgwee || tipNgwee === null}>
        Post test donation
      </Button>
    </form>
  );
}
