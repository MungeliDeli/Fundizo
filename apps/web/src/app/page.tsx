import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';

const STEPS = [
  {
    title: 'Start in minutes',
    body: 'Sign up with your phone number, tell the story, and publish. Donations can start straight away.',
  },
  {
    title: 'Share where people already are',
    body: 'Send the link to your WhatsApp groups, church and family. People give with MTN MoMo or Airtel Money.',
  },
  {
    title: 'Withdraw once verified',
    body: 'Money is held safely while we check the people and the need. Then it goes to a verified mobile money wallet.',
  },
] as const;

const TRUST = [
  {
    title: 'Verified before money moves',
    body: 'We check the organiser’s ID, ask the beneficiary to confirm by SMS, and look at evidence such as a hospital letter.',
  },
  {
    title: 'A public money trail',
    body: 'Every withdrawal is shown on the fundraiser’s page, so donors can see where their money went.',
  },
  {
    title: 'No fees for organisers',
    body: 'Fundizo runs on optional tips from donors. What you raise is yours, even if you don’t reach the goal.',
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="container-page grid gap-10 py-12 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-16 md:py-24">
        <div className="flex flex-col gap-5">
          <p className="m-0 text-sm font-semibold uppercase tracking-[0.06em] text-accent-ink">
            Fundraising for Zambia
          </p>
          <h1 className="display m-0 text-5xl">
            Raise money together, with the mobile money you already use.
          </h1>
          <p className="m-0 max-w-xl text-lg leading-relaxed text-ink-2">
            For hospital bills, funerals, school fees, weddings and community projects. Every
            fundraiser is checked, and every kwacha can be traced.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/start" className={buttonClasses('accent', 'lg')}>
              Start a fundraiser
            </Link>
            <Link href="/#how-it-works" className={buttonClasses('outline', 'lg')}>
              How it works
            </Link>
          </div>
          <p className="m-0 text-sm text-ink-3">
            Free for organisers. Giving by MTN MoMo and Airtel Money opens soon.
          </p>
        </div>

        <div className="rounded-card border border-line bg-surface p-6 md:p-8">
          <p className="m-0 text-sm font-semibold uppercase tracking-[0.06em] text-ink-3">
            How a gift works
          </p>
          <ol className="m-0 mt-5 flex list-none flex-col gap-5 p-0">
            {[
              'Open the fundraiser link from WhatsApp',
              'Choose an amount and enter your MTN or Airtel number',
              'Approve the prompt on your phone with your PIN',
              'Get an SMS receipt, and see the total go up',
            ].map((text, i) => (
              <li key={text} className="flex items-start gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunk text-sm font-bold text-ink-2">
                  {i + 1}
                </span>
                <span className="pt-1 text-base leading-snug">{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-t border-line bg-surface/50">
        <div className="container-page flex flex-col gap-8 py-12 md:py-20">
          <h2 className="display m-0 text-4xl">How it works</h2>
          <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3 md:gap-6">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6"
              >
                <span className="display text-3xl text-accent">{i + 1}</span>
                <h3 className="m-0 text-lg font-semibold">{s.title}</h3>
                <p className="m-0 leading-relaxed text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="trust"
        className="container-page flex scroll-mt-20 flex-col gap-8 py-12 md:py-20"
      >
        <h2 className="display m-0 text-4xl">Why people can trust it</h2>
        <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-3 md:gap-10">
          {TRUST.map((t) => (
            <li key={t.title} className="flex flex-col gap-2 border-t-2 border-good pt-4">
              <h3 className="m-0 text-lg font-semibold">{t.title}</h3>
              <p className="m-0 leading-relaxed text-ink-2">{t.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
