import { OwnCampaignResponse } from '@fundizo/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { StepCategory } from '@/features/campaigns/wizard/step-category';
import { StepGoal } from '@/features/campaigns/wizard/step-goal';
import { StepPhotos } from '@/features/campaigns/wizard/step-photos';
import { StepReview } from '@/features/campaigns/wizard/step-review';
import { StepStory } from '@/features/campaigns/wizard/step-story';
import { StepWho } from '@/features/campaigns/wizard/step-who';
import { isWizardStep } from '@/features/campaigns/wizard/steps';
import { WhoTips } from '@/features/campaigns/wizard/who-tips';
import { TipCard, WizardShell } from '@/features/campaigns/wizard/wizard-shell';
import { serverGet } from '@/lib/server-api';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Start a fundraiser', robots: { index: false } };

type Params = { id: string; step: string };

export default async function WizardStepPage({ params }: { params: Promise<Params> }) {
  const { id, step } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/start/${id}/${step}`)}`);
  if (!isWizardStep(step)) notFound();
  // Only the owner gets the draft back; anyone else sees "not found".
  const data = await serverGet(`/campaigns/${encodeURIComponent(id)}`, OwnCampaignResponse);
  if (!data) notFound();
  const c = data.campaign;
  if (c.status === 'published' && c.slug) redirect(`/f/${c.slug}`);

  switch (step) {
    case 'who':
      return (
        <WizardShell
          step="who"
          campaignId={c.id}
          title="Who are you raising money for?"
          aside={<WhoTips />}
        >
          <StepWho campaignId={c.id} initial={c.beneficiary} />
        </WizardShell>
      );
    case 'category':
      return (
        <WizardShell
          step="category"
          campaignId={c.id}
          title="What’s it for?"
          subtitle="This sets what evidence we’ll ask for later."
        >
          <StepCategory campaignId={c.id} initial={c.category} />
        </WizardShell>
      );
    case 'goal':
      return (
        <WizardShell
          step="goal"
          campaignId={c.id}
          title="How much do you need?"
          subtitle="Be realistic: fundraisers that are close to their goal get shared more."
          aside={
            <TipCard title="You keep what you raise">
              <p className="m-0">
                Even if you don’t reach the goal, the money raised goes to the fundraiser.
              </p>
              <p className="m-0">You can raise the goal later and explain why in an update.</p>
            </TipCard>
          }
        >
          <StepGoal campaignId={c.id} category={c.category} initial={c} />
        </WizardShell>
      );
    case 'story':
      return (
        <WizardShell
          step="story"
          campaignId={c.id}
          title="Tell the story"
          subtitle="Answer a few questions. Your own words work best."
        >
          <StepStory campaignId={c.id} category={c.category} initial={c} />
        </WizardShell>
      );
    case 'photos':
      return (
        <WizardShell
          step="photos"
          campaignId={c.id}
          title="Add photos"
          subtitle="Real photos help people trust and share your fundraiser."
          aside={
            <TipCard title="Good photos">
              <p className="m-0">Show the person, the place or the need. Daylight works best.</p>
              <p className="m-0">
                Avoid photos of documents, ID cards or children’s faces you don’t have permission to
                share.
              </p>
            </TipCard>
          }
        >
          <StepPhotos campaignId={c.id} initial={c.photos} />
        </WizardShell>
      );
    case 'review':
      return (
        <WizardShell
          step="review"
          campaignId={c.id}
          title="Review and publish"
          subtitle="Check everything once more."
        >
          <StepReview
            campaign={c}
            organiser={{
              firstName: user.firstName,
              lastName: user.lastName,
              emailVerified: user.emailVerified,
              phoneConfirmed: user.phone !== null,
            }}
          />
        </WizardShell>
      );
  }
}
