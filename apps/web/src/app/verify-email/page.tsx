import type { Metadata } from 'next';
import { InboxIllustration } from '@/components/illustrations/scenes';
import { AuthShell } from '@/features/auth/auth-shell';
import { VerifyEmailForm } from '@/features/auth/verify-email-form';

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false } };

type Params = { email?: string | string[]; code?: string | string[]; resent?: string | string[] };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  return (
    <AuthShell
      illustration={<InboxIllustration />}
      panelTitle="Trust starts here."
      panelText="Confirming your email keeps your account yours. It’s the first of the checks that make every Fundizo fundraiser safe to give to."
      title="Check your email"
      subtitle="We sent you a 6-digit code. Enter it below to confirm it’s you."
    >
      <VerifyEmailForm
        initialEmail={one(p.email)}
        initialCode={one(p.code)}
        resent={one(p.resent) === '1'}
      />
    </AuthShell>
  );
}
