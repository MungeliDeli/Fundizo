import { z } from 'zod';

/**
 * Money is always a whole number of ngwee (K1 = 100 ngwee). Never floats (CLAUDE.md money rule 1).
 * In JSON it travels as an integer; amounts on this platform stay far below 2^53.
 */
export const Ngwee = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export type Ngwee = z.infer<typeof Ngwee>;

export function kwachaToNgwee(kwacha: number): number {
  if (!Number.isSafeInteger(kwacha)) throw new RangeError(`Whole kwacha expected, got ${kwacha}`);
  return kwacha * 100;
}

/** "60000", "K60,000", " 1 500 " → ngwee. Whole kwacha only (goals don't need ngwee). Null if not a number. */
export function parseKwachaInput(input: string): number | null {
  const cleaned = input.trim().replace(/^k/i, '').replace(/[,\s]/g, '');
  if (!/^\d{1,10}$/.test(cleaned)) return null;
  return kwachaToNgwee(Number(cleaned));
}

/** 6000000 → "K60,000"; 11020 → "K110.20". Integer maths only. */
export function formatKwacha(ngwee: number): string {
  const whole = Math.floor(ngwee / 100);
  const cents = ngwee % 100;
  const wholeText = whole.toLocaleString('en-US');
  return cents === 0 ? `K${wholeText}` : `K${wholeText}.${String(cents).padStart(2, '0')}`;
}

/** Whole percent towards a goal, capped at 100. */
export function progressPercent(raised: number, goal: number | null): number {
  if (!goal || goal <= 0) return 0;
  return Math.min(100, Math.floor((raised * 100) / goal));
}
