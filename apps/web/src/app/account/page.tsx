import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { AccountActions } from '@/features/auth/account-actions';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Your account', robots: { index: false } };

type Params = { welcome?: string | string[]; password?: string | string[] };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account');
  const p = await searchParams;
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
  const memberSince = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Lusaka',
  }).format(new Date(user.createdAt));

  return (
    <div className="container-page flex flex-col gap-8 py-10 md:py-14">
      {p.welcome === '1' ? (
        <Alert tone="success">Your email is confirmed. Welcome to Fundizo, {user.firstName}!</Alert>
      ) : null}
      {p.password === 'changed' ? (
        <Alert tone="success">Your new password is saved. Other devices were logged out.</Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="flex flex-col gap-5 rounded-card border border-line bg-surface p-6 md:p-8">
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
              <p className="m-0 text-sm text-ink-3">Member since {memberSince}</p>
            </div>
          </div>
          <dl className="m-0 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
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
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                Phone number
              </dt>
              <dd className="m-0 text-ink-2">
                Not added yet. You’ll add and confirm it before publishing a fundraiser.
              </dd>
            </div>
          </dl>
        </section>

        <section className="flex flex-col gap-5 rounded-card border border-line bg-surface p-6 md:p-8">
          <h2 className="display m-0 text-xl">Security</h2>
          <p className="m-0 text-ink-2">
            Lost a phone, or used a shared computer? Log out everywhere else and keep only this
            device signed in.
          </p>
          <AccountActions />
        </section>
      </div>
    </div>
  );
}
