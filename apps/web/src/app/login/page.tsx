import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { WelcomeBackIllustration } from '@/components/illustrations/scenes';
import { AuthShell } from '@/features/auth/auth-shell';
import { LoginForm } from '@/features/auth/login-form';
import { safeNextPath } from '@/lib/redirects';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
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
      <LoginForm next={next} />
    </AuthShell>
  );
}
