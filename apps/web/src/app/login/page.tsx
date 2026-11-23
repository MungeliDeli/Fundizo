import { safeNextPath } from '@fundizo/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { WelcomeBackIllustration } from '@/components/illustrations/scenes';
import { Alert } from '@/components/ui/alert';
import { AuthShell } from '@/features/auth/auth-shell';
import { GoogleButton, OrDivider } from '@/features/auth/google-button';
import { googleErrorMessage } from '@/features/auth/google-errors';
import { LoginForm } from '@/features/auth/login-form';
import { getAuthProviders } from '@/lib/auth-providers';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Log in' };

type Params = { next?: string | string[]; error?: string | string[] };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getCurrentUser()) redirect(next);
  const { google } = await getAuthProviders();
  const googleError = googleErrorMessage(params.error);

  return (
    <AuthShell
      illustration={<WelcomeBackIllustration />}
      panelTitle="Welcome back."
      panelText="While you were away, people kept giving. Log in to see every gift, thank your donors and share again."
      title="Log in"
      subtitle="Good to see you again."
      footer={
        <>
          New to Fundizo?{' '}
          <Link href="/signup" className="font-semibold text-accent-ink">
            Create an account
          </Link>
        </>
      }
    >
      {googleError ? <Alert tone="error">{googleError}</Alert> : null}
      {google ? (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      ) : null}
      <LoginForm next={next} googleAvailable={google} />
    </AuthShell>
  );
}
