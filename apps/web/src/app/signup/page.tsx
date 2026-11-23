import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TogetherIllustration } from '@/components/illustrations/scenes';
import { AuthShell } from '@/features/auth/auth-shell';
import { GoogleButton, OrDivider } from '@/features/auth/google-button';
import { SignupForm } from '@/features/auth/signup-form';
import { getAuthProviders } from '@/lib/auth-providers';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Create your account' };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect('/account');
  const { google } = await getAuthProviders();
  return (
    <AuthShell
      illustration={<TogetherIllustration />}
      panelTitle="Raise it together."
      panelText="Hospital bills, funerals, school fees, a new church roof. Bring your people together around one goal, with the mobile money they already use."
      title="Create your account"
      subtitle="It takes a minute. You can start a fundraiser right after."
      footer={
        <>
          By creating an account you agree to use Fundizo honestly. Only raise money for real needs.{' '}
          <Link href="/login" className="font-semibold text-accent-ink">
            I already have an account
          </Link>
        </>
      }
    >
      {google ? (
        <>
          <GoogleButton />
          <OrDivider />
        </>
      ) : null}
      <SignupForm />
    </AuthShell>
  );
}
