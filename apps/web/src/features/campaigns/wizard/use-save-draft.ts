'use client';

import { type CampaignDraftUpdate, OwnCampaignResponse } from '@fundizo/shared';
import { useState } from 'react';
import { ApiError, apiPatch } from '@/lib/api';
import { formError } from '@/features/auth/error-messages';

/** Saves one wizard step to the server (autosave at every step, C-01). */
export function useSaveDraft(campaignId: string | null) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function save(patch: CampaignDraftUpdate): Promise<boolean> {
    if (!campaignId) return false;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await apiPatch(`/campaigns/${campaignId}`, patch, OwnCampaignResponse);
      return true;
    } catch (err) {
      if (err instanceof ApiError) setFieldErrors(err.fields);
      setError(formError(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { save, saving, error, fieldErrors, setFieldErrors };
}
