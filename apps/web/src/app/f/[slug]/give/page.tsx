import { PublicCampaignResponse } from '@fundizo/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DonatePage } from '@/features/donate/donate-page';
import { serverGet } from '@/lib/server-api';

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: 'Donate', robots: { index: false } };

export default async function GivePage({ params }: Props) {
  const { slug } = await params;
  const data = await serverGet(
    `/public/campaigns/${encodeURIComponent(slug)}`,
    PublicCampaignResponse,
    {
      auth: false,
    },
  );
  if (!data) notFound();
  return <DonatePage campaign={data.campaign} />;
}
