import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { StepWho } from '@/features/campaigns/wizard/step-who';
import { WhoTips } from '@/features/campaigns/wizard/who-tips';
import { WizardShell } from '@/features/campaigns/wizard/wizard-shell';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Start a fundraiser', robots: { index: false } };

/** Step 1 for a new fundraiser. The draft is created when the person presses Continue. */
export default async function StartPage() {
  if (!(await getCurrentUser())) redirect('/login?next=/start');
  return (
    <WizardShell
      step="who"
      campaignId={null}
      title="Who are you raising money for?"
      subtitle="It takes about five minutes. Your progress is saved at every step."
      aside={<WhoTips />}
    >
      <StepWho campaignId={null} initial={null} />
    </WizardShell>
  );
}
