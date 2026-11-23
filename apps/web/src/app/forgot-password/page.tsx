import type { Metadata } from 'next';
import Link from 'next/link';
import { KeyIllustration } from '@/components/illustrations/scenes';
import { AuthShell } from '@/features/auth/auth-shell';
import { ForgotPasswordForm } from '@/features/auth/password-forms';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      illustration={<KeyIllustration />}
      panelTitle="Locked out? It happens."
      panelText="We’ll email you a one-time link. Your fundraisers and the money in them stay safe while you get back in."
      title="Forgot your password?"
      subtitle="Enter your email and we’ll send you a link to set a new one."
      footer={
        <Link href="/login" className="font-semibold text-accent-ink">
          Back to log in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
