import type { Metadata } from 'next';
import { KeyIllustration } from '@/components/illustrations/scenes';
import { AuthShell } from '@/features/auth/auth-shell';
import { ResetPasswordForm } from '@/features/auth/password-forms';

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false },
  referrer: 'no-referrer',
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const token = (await searchParams).token;
  return (
    <AuthShell
      illustration={<KeyIllustration />}
      panelTitle="A fresh start."
      panelText="Choose a password you don’t use anywhere else. A short sentence is easy to remember and hard to guess."
      title="Set a new password"
    >
      <ResetPasswordForm token={typeof token === 'string' ? token : ''} />
    </AuthShell>
  );
}
