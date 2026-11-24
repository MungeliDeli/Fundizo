import {
  OwnCampaignList,
  PublicCampaignResponse,
  PublicDonationsResponse,
  formatKwacha,
} from '@fundizo/shared';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
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
  const cover = c.photos[0];
  // Link previews need an absolute image URL: build it from the address this page was opened on.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const absolute = (url: string) => new URL(url, `${proto}://${host}`).toString();
  return {
    title: c.title,
    description,
    openGraph: {
      title: c.title,
      description,
      type: 'website',
      siteName: 'Fundizo',
      // The cover photo (blurred version if it's marked sensitive) for WhatsApp/Facebook previews.
      images: cover
        ? [
            {
              url: absolute(cover.sensitive ? cover.blurUrl : cover.url),
              width: cover.width,
              height: cover.height,
            },
          ]
        : undefined,
    },
    twitter: { card: cover ? 'summary_large_image' : 'summary', title: c.title, description },
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
  const donations = (await serverGet(
    `/public/campaigns/${encodeURIComponent(slug)}/donations`,
    PublicDonationsResponse,
    { auth: false },
  )) ?? { donorCount: 0, donations: [] };
  return (
    <CampaignPage campaign={data.campaign} donations={donations} justPublished={justPublished} />
  );
}
