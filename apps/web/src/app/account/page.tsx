import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PhoneCodeIllustration } from '@/components/illustrations/scenes';
import { Alert } from '@/components/ui/alert';
import { AccountActions } from '@/features/auth/account-actions';
import { GoogleButton } from '@/features/auth/google-button';
import { googleErrorMessage } from '@/features/auth/google-errors';
import { PhoneForm } from '@/features/profile/phone-form';
import { ProfileForm } from '@/features/profile/profile-form';
import { PublishReadiness } from '@/features/profile/publish-readiness';
import { getAuthProviders } from '@/lib/auth-providers';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Your profile', robots: { index: false } };

type Params = {
  welcome?: string | string[];
  password?: string | string[];
  google?: string | string[];
  error?: string | string[];
};

const card = 'flex flex-col gap-5 rounded-card border border-line bg-surface p-6 md:p-8';

/** Your profile (A-02), phone (A-13), ways to log in (A-01, A-12) and security (A-03). */
export default async function AccountPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account');
  const p = await searchParams;
  const { google: googleAvailable } = await getAuthProviders();
  const googleError = googleErrorMessage(p.error);
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
  const memberSince = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Lusaka',
  }).format(new Date(user.createdAt));
  const place = [user.district, user.province].filter(Boolean).join(', ');

  return (
    <div className="container-page flex flex-col gap-6 py-8 md:py-12">
      {p.welcome === '1' ? (
        <Alert tone="success">Your email is confirmed. Welcome to Fundizo, {user.firstName}!</Alert>
      ) : null}
      {p.password === 'changed' ? (
        <Alert tone="success">Your new password is saved. Other devices were logged out.</Alert>
      ) : null}
      {p.google === 'linked' ? (
        <Alert tone="success">Google is connected. Next time you can log in with one tap.</Alert>
      ) : null}
      {googleError ? <Alert tone="error">{googleError}</Alert> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_1fr] lg:gap-8">
        <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
          <section className={card}>
            <div className="flex items-center gap-4">
              <span
                className="display grid size-16 shrink-0 place-items-center rounded-full bg-accent-soft text-2xl text-accent-ink"
                aria-hidden="true"
              >
                {initials}
              </span>
              <div className="min-w-0">
                <h1 className="display m-0 text-2xl">
                  {user.firstName} {user.lastName}
                </h1>
                <p className="m-0 text-sm text-ink-3">{place || `Member since ${memberSince}`}</p>
              </div>
            </div>
            <dl className="m-0 flex flex-col gap-1">
              <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                Email
              </dt>
              <dd className="m-0 flex flex-wrap items-center gap-2 break-all">
                {user.email}
                {user.emailVerified ? (
                  <span className="inline-flex h-6 items-center rounded-full bg-good-soft px-2 text-xs font-semibold text-good">
                    Confirmed
                  </span>
                ) : null}
              </dd>
            </dl>
            {place ? <p className="m-0 text-sm text-ink-3">Member since {memberSince}</p> : null}
          </section>
          <PublishReadiness user={user} />
        </aside>

        <div className="flex flex-col gap-6">
          <section className={card} aria-labelledby="details-title">
            <div className="flex flex-col gap-1">
              <h2 id="details-title" className="display m-0 text-xl">
                Your details
              </h2>
            </div>
            <ProfileForm user={user} />
          </section>

          <section className={card} aria-labelledby="phone-title">
            <div className="grid items-center gap-6 md:grid-cols-[1fr_12rem]">
              <div className="flex flex-col gap-1">
                <h2 id="phone-title" className="display m-0 text-xl">
                  Phone number
                </h2>
                <p className="m-0 text-sm text-ink-2">
                  Needed before you publish a fundraiser. We use it for important alerts and, later,
                  payouts to your mobile money wallet. It’s never shown to donors.
                </p>
              </div>
              <PhoneCodeIllustration className="mx-auto hidden max-w-[12rem] md:block" />
            </div>
            <PhoneForm phone={user.phone} />
          </section>

          <section className={card} aria-labelledby="login-title">
            <h2 id="login-title" className="display m-0 text-xl">
              Ways to log in
            </h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              <li className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-semibold">Email and password</span>
                  <span className="text-sm text-ink-3">
                    {user.hasPassword ? 'Set' : 'No password yet'}
                  </span>
                </div>
                <Link href="/forgot-password" className="text-sm font-semibold text-accent-ink">
                  {user.hasPassword ? 'Change password' : 'Set a password'}
                </Link>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-semibold">Google</span>
                  <span className="text-sm text-ink-3">
                    {user.googleLinked
                      ? 'Connected'
                      : googleAvailable
                        ? 'Not connected'
                        : 'Not available yet'}
                  </span>
                </div>
                {user.googleLinked ? (
                  <span className="inline-flex h-6 items-center rounded-full bg-good-soft px-2 text-xs font-semibold text-good">
                    Connected
                  </span>
                ) : googleAvailable ? (
                  <GoogleButton
                    next="/account"
                    label="Connect Google"
                    fullWidth={false}
                    className="h-10 px-4 text-sm"
                  />
                ) : null}
              </li>
            </ul>
          </section>

          <section className={card} aria-labelledby="security-title">
            <h2 id="security-title" className="display m-0 text-xl">
              Security
            </h2>
            <p className="m-0 text-ink-2">
              Lost a phone, or used a shared computer? Log out everywhere else and keep only this
              device signed in.
            </p>
            <AccountActions />
          </section>
        </div>
      </div>
    </div>
  );
}
