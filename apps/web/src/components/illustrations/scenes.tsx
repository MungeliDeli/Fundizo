/**
 * Illustrations for the account screens. Each one tells part of the Fundizo story:
 * people → mobile money → one shared goal → verified and safe.
 *
 * Inline SVG (no image requests on 3G), coloured only with design tokens (fill-accent, fill-surface…)
 * so they follow light and dark mode. Decorative: hidden from screen readers.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

function Svg({
  children,
  className,
  viewBox = '0 0 400 320',
}: {
  children: ReactNode;
  className?: string;
  viewBox?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={cn('h-auto w-full', className)}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function Person({
  x,
  y,
  tone = 'good',
  r = 26,
}: {
  x: number;
  y: number;
  tone?: 'good' | 'accent';
  r?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} className={tone === 'good' ? 'fill-good-soft' : 'fill-accent-soft'} />
      <circle r={r} className="fill-none stroke-surface" strokeWidth="4" />
      <circle cy={-r * 0.22} r={r * 0.3} className="fill-ink-2" />
      <path
        d={`M ${-r * 0.5} ${r * 0.55} a ${r * 0.5} ${r * 0.42} 0 0 1 ${r} 0 Z`}
        className="fill-ink-2"
      />
    </g>
  );
}

/** A kwacha coin. */
function Coin({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r="12" className="fill-accent" />
      <circle
        r="8.5"
        className="fill-none stroke-on-accent"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
      <path
        d="M-3 -5 V5 M3.5 -5 L-3 0.5 L3.5 5"
        className="fill-none stroke-on-accent"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function Heart({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 5 C-7 -1 -9 -6 -5.5 -8.5 C-3 -10 -1 -9 0 -7 C1 -9 3 -10 5.5 -8.5 C9 -6 7 -1 0 5Z"
      className="fill-accent"
    />
  );
}

function Sparkle({
  x,
  y,
  s = 1,
  tone = 'accent',
}: {
  x: number;
  y: number;
  s?: number;
  tone?: 'accent' | 'good';
}) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8Z"
      className={tone === 'accent' ? 'fill-accent' : 'fill-good'}
    />
  );
}

function CheckBadge({ x, y, r = 16 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r + 4} className="fill-surface" />
      <circle r={r} className="fill-good" />
      <path
        d={`M${-r * 0.4} 0 L${-r * 0.1} ${r * 0.32} L${r * 0.45} ${-r * 0.32}`}
        className="fill-none stroke-surface"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** A phone showing a fundraiser card with a progress bar. */
function Phone({ x, y, progress = 0.66 }: { x: number; y: number; progress?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="112" height="212" rx="22" className="fill-ink" />
      <rect x="8" y="10" width="96" height="192" rx="15" className="fill-surface" />
      <rect x="44" y="16" width="24" height="5" rx="2.5" className="fill-line" />
      <rect x="16" y="30" width="80" height="54" rx="9" className="fill-sunk" />
      <Heart x={56} y={58} s={1.5} />
      <rect x="16" y="94" width="68" height="7" rx="3.5" className="fill-ink" />
      <rect x="16" y="106" width="48" height="6" rx="3" className="fill-line" />
      <rect x="16" y="124" width="80" height="8" rx="4" className="fill-sunk" />
      <rect x="16" y="124" width={80 * progress} height="8" rx="4" className="fill-accent" />
      <rect x="16" y="140" width="36" height="6" rx="3" className="fill-ink-3" opacity="0.5" />
      <rect x="16" y="172" width="80" height="20" rx="10" className="fill-accent" />
    </g>
  );
}

/** Sign up: a community, each sending kwacha to one shared fundraiser. */
export function TogetherIllustration({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="200" cy="160" r="146" className="fill-surface" opacity="0.55" />
      <circle
        cx="200"
        cy="160"
        r="116"
        className="fill-none stroke-accent"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      {[
        [78, 92, 146, 118],
        [70, 222, 146, 196],
        [326, 88, 256, 118],
        [334, 220, 256, 196],
      ].map(([x1, y1, x2, y2]) => (
        <path
          key={`${x1}-${y1}`}
          d={`M${x1} ${y1} L${x2} ${y2}`}
          className="stroke-accent"
          strokeOpacity="0.5"
          strokeWidth="2"
          strokeDasharray="3 6"
          strokeLinecap="round"
        />
      ))}
      <Phone x={144} y={52} progress={0.68} />
      <CheckBadge x={252} y={60} />
      <Person x={78} y={92} tone="good" />
      <Person x={70} y={222} tone="accent" />
      <Person x={326} y={88} tone="accent" />
      <Person x={334} y={220} tone="good" />
      <Coin x={114} y={106} s={0.85} />
      <Coin x={110} y={208} s={0.85} />
      <Coin x={290} y={104} s={0.85} />
      <Coin x={296} y={208} s={0.85} />
      <Heart x={118} y={46} s={1.2} />
      <Heart x={300} y={40} s={0.9} />
      <Sparkle x={36} y={156} />
      <Sparkle x={368} y={152} s={0.8} tone="good" />
      <Sparkle x={200} y={296} s={0.9} />
    </Svg>
  );
}

function Notification({ x, y, tone }: { x: number; y: number; tone: 'good' | 'accent' }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width="168"
        height="48"
        rx="14"
        className="fill-surface stroke-line"
        strokeWidth="1.5"
      />
      <circle
        cx="24"
        cy="24"
        r="13"
        className={tone === 'good' ? 'fill-good-soft' : 'fill-accent-soft'}
      />
      <circle cx="24" cy="20" r="4.5" className="fill-ink-2" />
      <path d="M16.5 31 a7.5 6 0 0 1 15 0Z" className="fill-ink-2" />
      <rect x="46" y="15" width="70" height="7" rx="3.5" className="fill-ink" />
      <rect x="46" y="28" width="48" height="6" rx="3" className="fill-line" />
      <Coin x={146} y={24} s={0.75} />
    </g>
  );
}

/** Log in: your fundraiser keeps receiving gifts while you're away. */
export function WelcomeBackIllustration({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="190" cy="160" r="146" className="fill-surface" opacity="0.55" />
      <Phone x={84} y={54} progress={0.82} />
      <Notification x={170} y={78} tone="good" />
      <Notification x={196} y={140} tone="accent" />
      <Notification x={170} y={202} tone="good" />
      <g transform="translate(70 66)">
        <circle r="22" className="fill-accent" />
        <path
          d="M-8 4 a8 8 0 0 1 16 0 v-6 a8 8 0 0 0 -16 0Z M-10 4 H10 M-3 8 a3 3 0 0 0 6 0"
          className="fill-none stroke-on-accent"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path
        d="M40 46 q-8 20 0 40 M30 38 q-12 28 0 56"
        className="fill-none stroke-accent"
        strokeOpacity="0.5"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <CheckBadge x={196} y={56} r={14} />
      <Sparkle x={356} y={60} />
      <Sparkle x={52} y={250} s={0.9} tone="good" />
      <Heart x={350} y={270} s={1.1} />
    </Svg>
  );
}

/** Verify email: a letter with a 6-digit code rises out of the envelope. */
export function InboxIllustration({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="200" cy="160" r="146" className="fill-surface" opacity="0.55" />
      <path
        d="M90 150 L200 82 L310 150 Z"
        className="fill-sunk stroke-line"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <g>
        <rect
          x="114"
          y="62"
          width="172"
          height="132"
          rx="14"
          className="fill-surface stroke-line"
          strokeWidth="1.5"
        />
        <rect x="134" y="82" width="74" height="8" rx="4" className="fill-ink" />
        <rect x="134" y="96" width="112" height="6" rx="3" className="fill-line" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i} transform={`translate(${134 + i * 23} 116)`}>
            <rect
              width="18"
              height="26"
              rx="5"
              className={i < 3 ? 'fill-accent-soft stroke-accent' : 'fill-sunk stroke-line'}
              strokeWidth="1.5"
            />
            {i < 3 ? <circle cx="9" cy="13" r="3" className="fill-accent" /> : null}
          </g>
        ))}
        <rect x="134" y="158" width="64" height="16" rx="8" className="fill-accent" />
      </g>
      <path
        d="M90 150 L200 222 L310 150 V258 a16 16 0 0 1 -16 16 H106 a16 16 0 0 1 -16 -16 Z"
        className="fill-surface stroke-line"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M90 266 L176 206 M310 266 L224 206" className="stroke-line" strokeWidth="1.5" />
      <g transform="translate(300 96)">
        <path
          d="M0 -26 L22 -18 V2 C22 16 12 24 0 30 C-12 24 -22 16 -22 2 V-18 Z"
          className="fill-good"
        />
        <path
          d="M-8 2 L-2 8 L9 -5"
          className="fill-none stroke-surface"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <Sparkle x={74} y={96} />
      <Sparkle x={340} y={210} s={0.8} tone="good" />
      <Sparkle x={196} y={36} s={0.7} />
    </Svg>
  );
}

/** Forgot / reset password: a padlock and its key, kept safe. */
export function KeyIllustration({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="200" cy="160" r="146" className="fill-surface" opacity="0.55" />
      <path
        d="M160 150 V116 a40 40 0 0 1 80 0 V150"
        className="fill-none stroke-ink"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <rect x="128" y="140" width="144" height="118" rx="24" className="fill-accent" />
      <rect
        x="128"
        y="140"
        width="144"
        height="118"
        rx="24"
        className="fill-none stroke-on-accent"
        strokeOpacity="0.15"
        strokeWidth="8"
      />
      <circle cx="200" cy="190" r="13" className="fill-accent-soft" />
      <rect x="194" y="196" width="12" height="28" rx="6" className="fill-accent-soft" />
      <g transform="translate(318 214) rotate(-35)">
        <circle r="20" className="fill-none stroke-ink" strokeWidth="9" />
        <rect x="18" y="-5" width="62" height="10" rx="5" className="fill-ink" />
        <rect x="56" y="3" width="9" height="16" rx="3" className="fill-ink" />
        <rect x="70" y="3" width="9" height="11" rx="3" className="fill-ink" />
      </g>
      <CheckBadge x={268} y={140} />
      <Sparkle x={86} y={92} />
      <Sparkle x={96} y={246} s={0.8} tone="good" />
      <Coin x={330} y={82} s={0.9} />
      <Heart x={70} y={170} s={1.1} />
    </Svg>
  );
}

/** Phone confirmation: a text message with a 6-digit code arrives on the phone. */
export function PhoneCodeIllustration({ className }: { className?: string }) {
  return (
    <Svg className={className} viewBox="0 0 240 180">
      <circle cx="120" cy="92" r="84" className="fill-accent-soft" />
      <g transform="translate(78 22)">
        <rect width="84" height="150" rx="16" className="fill-ink" />
        <rect x="6" y="8" width="72" height="134" rx="11" className="fill-surface" />
        <rect x="32" y="13" width="20" height="4" rx="2" className="fill-line" />
      </g>
      <g transform="translate(38 66)">
        <rect
          width="132"
          height="52"
          rx="14"
          className="fill-surface stroke-line"
          strokeWidth="1.5"
        />
        <path d="M18 52 L14 64 L30 52 Z" className="fill-surface" />
        <rect x="14" y="12" width="56" height="6" rx="3" className="fill-ink" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect
            key={i}
            x={14 + i * 18}
            y="26"
            width="13"
            height="16"
            rx="4"
            className={i < 3 ? 'fill-accent' : 'fill-sunk'}
          />
        ))}
      </g>
      <CheckBadge x={170} y={46} r={13} />
      <Sparkle x={40} y={40} s={0.8} />
      <Sparkle x={206} y={140} s={0.7} tone="good" />
    </Svg>
  );
}
