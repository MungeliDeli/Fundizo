import { OwnCampaignList, PublicCampaignResponse, formatKwacha } from '@fundizo/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { CampaignPage } from '@/features/campaigns/public/campaign-page';
import { serverGet } from '@/lib/server-api';
import { getCurrentUser } from '@/lib/session';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ published?: string | string[] }>;
};

const load = cache(async (slug: string) =>
  serverGet(`/public/campaigns/${encodeURIComponent(slug)}`, PublicCampaignResponse, {
    auth: false,
  }),
);

/** Link previews for WhatsApp and Facebook (O-02). The photo joins with C-05. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug);
  if (!data) return { title: 'Fundraiser not found' };
  const c = data.campaign;
  const goal = c.goalNgwee ? `Goal ${formatKwacha(c.goalNgwee)}. ` : '';
  const description = `${goal}${c.story.whatHappened}`.slice(0, 200);
  return {
    title: c.title,
    description,
    openGraph: { title: c.title, description, type: 'website', siteName: 'Fundizo' },
    twitter: { card: 'summary', title: c.title, description },
  };
}

export default async function FundraiserPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  // The "you're live" banner only for the organiser, straight after publishing.
  let justPublished = false;
  if ((await searchParams).published === '1' && (await getCurrentUser())) {
    const mine = await serverGet('/campaigns/mine', OwnCampaignList);
    justPublished = Boolean(mine?.campaigns.some((c) => c.slug === slug));
  }
  return <CampaignPage campaign={data.campaign} justPublished={justPublished} />;
}
