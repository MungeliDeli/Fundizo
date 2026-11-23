import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

export const metadata: Metadata = { title: 'Dev email outbox', robots: { index: false } };
export const dynamic = 'force-dynamic';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const Outbox = z.object({
  transport: z.enum(['outbox', 'brevo']),
  messages: z.array(
    z.object({
      id: z.string(),
      sentAt: z.string(),
      tag: z.string(),
      subject: z.string(),
      text: z.string(),
      to: z.object({ email: z.string() }),
    }),
  ),
});

/** Development only: emails the API would have sent, when no Brevo key is configured. */
export default async function DevOutboxPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const res = await fetch(`${API_INTERNAL_URL}/dev/outbox`, { cache: 'no-store' }).catch(
    () => null,
  );
  const parsed = res?.ok ? Outbox.safeParse(await res.json()) : null;

  return (
    <div className="container-page flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-accent-ink">
          Development only
        </p>
        <h1 className="display m-0 text-3xl">Email outbox</h1>
        <p className="m-0 max-w-prose text-ink-2">
          {parsed?.success && parsed.data.transport === 'brevo'
            ? 'Brevo is configured, so emails go to real inboxes. Nothing is kept here.'
            : 'No Brevo key is set, so emails land here instead of an inbox. Newest first; the last 50 are kept.'}
        </p>
      </div>
      {!parsed?.success ? <p className="text-bad">Couldn’t reach the API.</p> : null}
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {parsed?.success
          ? parsed.data.messages.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="m-0 text-lg font-semibold">{m.subject}</h2>
                  <span className="text-xs text-ink-3">
                    {m.tag} · to {m.to.email} ·{' '}
                    {new Date(m.sentAt).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka' })}
                  </span>
                </div>
                <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-control bg-sunk p-4 font-sans text-sm text-ink-2">
                  {m.text}
                </pre>
              </li>
            ))
          : null}
        {parsed?.success && parsed.data.messages.length === 0 ? (
          <li className="text-ink-3">No emails yet. Sign up to see one.</li>
        ) : null}
      </ul>
    </div>
  );
}
