import { formatLocalMobile } from '@fundizo/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

export const metadata: Metadata = { title: 'Dev outbox', robots: { index: false } };
export const dynamic = 'force-dynamic';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const Transport = z.enum(['outbox', 'brevo']);
const Outbox = z.object({
  transport: Transport,
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
  sms: z.object({
    transport: Transport,
    messages: z.array(
      z.object({
        id: z.string(),
        sentAt: z.string(),
        tag: z.string(),
        text: z.string(),
        to: z.string(),
      }),
    ),
  }),
});

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka' });

/** Development only: emails and texts the API would have sent, while Brevo isn't switched on. */
export default async function DevOutboxPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const res = await fetch(`${API_INTERNAL_URL}/dev/outbox`, { cache: 'no-store' }).catch(
    () => null,
  );
  const parsed = res?.ok ? Outbox.safeParse(await res.json()) : null;
  const data = parsed?.success ? parsed.data : null;

  return (
    <div className="container-page flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-accent-ink">
          Development only
        </p>
        <h1 className="display m-0 text-3xl">Outbox</h1>
        <p className="m-0 max-w-prose text-ink-2">
          Emails and text messages land here instead of real inboxes and phones until Brevo is
          switched on. Newest first; the last 50 of each are kept.
        </p>
      </div>
      {!data ? <p className="text-bad">Couldn’t reach the API.</p> : null}

      {data ? (
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-4" aria-labelledby="sms-title">
            <h2 id="sms-title" className="display m-0 text-xl">
              Text messages (SMS)
            </h2>
            {data.sms.transport === 'brevo' ? (
              <p className="m-0 text-ink-2">SMS_TRANSPORT=brevo: texts go to real phones.</p>
            ) : data.sms.messages.length === 0 ? (
              <p className="m-0 text-ink-3">
                No texts yet. Add a phone number on your profile to see one.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {data.sms.messages.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4"
                  >
                    <span className="text-xs text-ink-3">
                      {m.tag} · to {formatLocalMobile(m.to)} · {time(m.sentAt)}
                    </span>
                    <p className="m-0 rounded-2xl rounded-bl-sm bg-sunk px-4 py-3 text-base">
                      {m.text}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="email-title">
            <h2 id="email-title" className="display m-0 text-xl">
              Emails
            </h2>
            {data.transport === 'brevo' ? (
              <p className="m-0 text-ink-2">Brevo is configured, so emails go to real inboxes.</p>
            ) : data.messages.length === 0 ? (
              <p className="m-0 text-ink-3">No emails yet. Sign up to see one.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {data.messages.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4"
                  >
                    <div className="flex flex-col gap-1">
                      <h3 className="m-0 text-base font-semibold">{m.subject}</h3>
                      <span className="text-xs text-ink-3">
                        {m.tag} · to {m.to.email} · {time(m.sentAt)}
                      </span>
                    </div>
                    <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-control bg-sunk p-3 font-sans text-sm text-ink-2">
                      {m.text}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
