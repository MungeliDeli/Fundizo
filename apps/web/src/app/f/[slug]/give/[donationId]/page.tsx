import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DonationStatus } from '@/features/donate/donation-status';

type Props = { params: Promise<{ slug: string; donationId: string }> };

export const metadata: Metadata = { title: 'Your gift', robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DonationPage({ params }: Props) {
  const { slug, donationId } = await params;
  if (!UUID.test(donationId)) notFound();
  return (
    <div className="container-page py-6 md:py-10">
      <DonationStatus donationId={donationId} slug={slug} />
    </div>
  );
}
