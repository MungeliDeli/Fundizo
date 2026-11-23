import { describe, expect, it } from 'vitest';
import { formatKwacha, kwachaToNgwee, parseKwachaInput, progressPercent } from './money.js';

describe('money', () => {
  it('converts and formats with integer maths', () => {
    expect(kwachaToNgwee(60000)).toBe(6_000_000);
    expect(formatKwacha(6_000_000)).toBe('K60,000');
    expect(formatKwacha(11_020)).toBe('K110.20');
    expect(formatKwacha(5)).toBe('K0.05');
    expect(() => kwachaToNgwee(1.5)).toThrow();
  });

  it.each([
    ['60000', 6_000_000],
    ['K60,000', 6_000_000],
    [' 1 500 ', 150_000],
  ])('parses %s', (input, ngwee) => expect(parseKwachaInput(input)).toBe(ngwee));

  it.each(['', 'abc', '12.50', '-5', '1e3'])('rejects %s', (input) =>
    expect(parseKwachaInput(input)).toBeNull(),
  );

  it('caps progress at 100 and handles no goal', () => {
    expect(progressPercent(3_845_000, 6_000_000)).toBe(64);
    expect(progressPercent(9_000_000, 6_000_000)).toBe(100);
    expect(progressPercent(100, null)).toBe(0);
  });
});
