import { describe, expect, it } from 'vitest';
import { CreateDonationRequest, RetryDonationRequest, suggestedTip } from './donations.js';

const valid = {
  campaignSlug: 'help-mary-abcd',
  amountNgwee: 10_000,
  tipNgwee: 1_000,
  phone: '096 123 4567',
  anonymous: false,
  donorName: 'Natasha',
};

describe('suggestedTip', () => {
  it('is a whole-kwacha percentage, rounded half up', () => {
    expect(suggestedTip(10_000, 10)).toBe(1_000); // K100 → K10
    expect(suggestedTip(5_000, 10)).toBe(500); // K50 → K5
    expect(suggestedTip(500, 10)).toBe(100); // K5 → K0.50 → K1
    expect(suggestedTip(1_400, 10)).toBe(100); // K14 → K1.40 → K1
    expect(suggestedTip(10_000, 0)).toBe(0);
    expect(suggestedTip(50_000, 15)).toBe(7_500);
  });
});

describe('CreateDonationRequest', () => {
  it('accepts a normal gift', () => {
    expect(CreateDonationRequest.safeParse(valid).success).toBe(true);
    expect(
      CreateDonationRequest.safeParse({ ...valid, anonymous: true, donorName: undefined }).success,
    ).toBe(true);
  });

  it.each([
    [{ amountNgwee: 400 }, 'The smallest gift is K5.'],
    [{ amountNgwee: 5_050 }, 'Use whole kwacha.'],
    [{ amountNgwee: 5_000_100 }, 'The largest gift is K50,000.'],
    [{ tipNgwee: -100 }, undefined],
    [{ phone: '095 123 4567' }, 'Zamtel isn’t supported yet. Use an MTN or Airtel number.'],
    [{ phone: '12345' }, 'Enter an MTN or Airtel number, like 096 123 4567.'],
    [{ donorName: '' }, 'Add your name, or give anonymously.'],
  ])('refuses %o', (patch, message) => {
    const r = CreateDonationRequest.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    if (message) expect(r.error?.issues.map((i) => i.message)).toContain(message);
  });

  it('refuses unknown fields and floats', () => {
    expect(CreateDonationRequest.safeParse({ ...valid, admin: true }).success).toBe(false);
    expect(CreateDonationRequest.safeParse({ ...valid, amountNgwee: 100.5 }).success).toBe(false);
  });

  it('retry takes an optional new number only', () => {
    expect(RetryDonationRequest.safeParse({}).success).toBe(true);
    expect(RetryDonationRequest.safeParse({ phone: '0771234567' }).success).toBe(true);
    expect(RetryDonationRequest.safeParse({ amountNgwee: 1 }).success).toBe(false);
  });
});
