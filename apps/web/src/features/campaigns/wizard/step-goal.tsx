'use client';

import {
  type CampaignCategory,
  CampaignDraftUpdate,
  GOAL_MIN,
  PROVINCES,
  formatKwacha,
  parseKwachaInput,
} from '@fundizo/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { fieldErrors } from '@/lib/api';
import { stepHref } from './steps';
import { useSaveDraft } from './use-save-draft';

interface Props {
  campaignId: string;
  category: CampaignCategory | null;
  initial: {
    goalNgwee: number | null;
    endDate: string | null;
    province: string | null;
    district: string | null;
  };
}

/** Step 3 (C-06): goal in kwacha, an optional end date, and where the need is. */
export function StepGoal({ campaignId, category, initial }: Props) {
  const router = useRouter();
  const draft = useSaveDraft(campaignId);
  const optionalGoal = category === 'funeral';
  const [goal, setGoal] = useState(initial.goalNgwee ? String(initial.goalNgwee / 100) : '');
  const [endDate, setEndDate] = useState(initial.endDate ?? '');
  const [province, setProvince] = useState(initial.province ?? '');
  const [district, setDistrict] = useState(initial.district ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const today = new Date().toISOString().slice(0, 10);
  const goalNgwee = goal.trim() ? parseKwachaInput(goal) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (goal.trim() && goalNgwee === null) local.goalNgwee = 'Enter whole kwacha, like 60000.';
    if (!goal.trim() && !optionalGoal)
      local.goalNgwee = 'Set a goal. You keep what you raise, even if you don’t reach it.';
    if (endDate && endDate <= today)
      local.endDate = 'Choose a date after today, or leave it empty.';
    const parsed = CampaignDraftUpdate.safeParse({
      goalNgwee,
      endDate: endDate || null,
      province: province || null,
      district: district.trim() || null,
    });
    const all = { ...(parsed.success ? {} : fieldErrors(parsed.error)), ...local };
    if (Object.keys(all).length > 0 || !parsed.success) {
      setErrors(all);
      return;
    }
    setErrors({});
    if (await draft.save(parsed.data)) router.push(stepHref(campaignId, 'story'));
  }

  const shown = { ...errors, ...draft.fieldErrors };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {draft.error ? <Alert tone="error">{draft.error}</Alert> : null}
      <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 md:p-6">
        <TextField
          label={optionalGoal ? 'Goal in kwacha (optional)' : 'Goal in kwacha'}
          inputMode="numeric"
          placeholder={`e.g. 60000 (at least ${formatKwacha(GOAL_MIN)})`}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          error={shown.goalNgwee}
          className="tabular"
          hint={
            goalNgwee
              ? `${formatKwacha(goalNgwee)}. You keep what you raise, even if you don’t reach the goal.`
              : 'You keep what you raise, even if you don’t reach the goal.'
          }
        />
        <TextField
          label="End date (optional)"
          type="date"
          min={today}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          error={shown.endDate}
          hint="Leave empty to keep it open. You can end it any time."
        />
      </div>

      <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 md:p-6">
        <p className="m-0 text-base font-semibold">Where is this?</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Province"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            error={shown.province}
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
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            error={shown.district}
            maxLength={60}
          />
        </div>
        <p className="m-0 text-sm text-ink-3">
          Shown on the fundraiser, so people nearby can find it.
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        loading={draft.saving}
        className="w-full sm:w-auto sm:self-start sm:px-10"
      >
        Continue
      </Button>
    </form>
  );
}
