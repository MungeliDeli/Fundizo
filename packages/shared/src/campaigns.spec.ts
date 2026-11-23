import { describe, expect, it } from 'vitest';
import {
  CampaignDraftUpdate,
  CreateCampaignRequest,
  PublicCampaign,
  publishProblems,
} from './campaigns.js';

const ready = {
  category: 'medical' as const,
  goalNgwee: 6_000_000,
  title: 'Help Mary get her heart surgery',
  story: {
    whatHappened: 'Doctors found a blocked heart valve and referred her to UTH for surgery.',
    moneyFor: 'The operation and two weeks in hospital.',
    extra: '',
  },
};
const verified = { emailVerified: true, phoneVerified: true };

describe('beneficiary', () => {
  it('accepts self, or someone else with a normalised phone', () => {
    expect(CreateCampaignRequest.parse({ beneficiary: { kind: 'self' } })).toEqual({
      beneficiary: { kind: 'self' },
    });
    expect(
      CreateCampaignRequest.parse({
        beneficiary: {
          kind: 'someone_else',
          name: ' Joseph Banda ',
          relationship: 'brother',
          phone: '097 123 4567',
        },
      }),
    ).toEqual({
      beneficiary: {
        kind: 'someone_else',
        name: 'Joseph Banda',
        relationship: 'brother',
        phone: '+260971234567',
      },
    });
  });

  it('needs a name and relationship for someone else', () => {
    expect(
      CreateCampaignRequest.safeParse({
        beneficiary: { kind: 'someone_else', name: '', relationship: '', phone: null },
      }).success,
    ).toBe(false);
  });
});

describe('CampaignDraftUpdate', () => {
  it('accepts partial updates and enforces limits', () => {
    expect(CampaignDraftUpdate.parse({ category: 'funeral' })).toEqual({ category: 'funeral' });
    expect(CampaignDraftUpdate.safeParse({ title: 'x'.repeat(61) }).success).toBe(false);
    expect(CampaignDraftUpdate.safeParse({ goalNgwee: 5_000 }).success).toBe(false); // K50 < K100
    expect(CampaignDraftUpdate.safeParse({ goalNgwee: 60.5 }).success).toBe(false); // no floats
    expect(CampaignDraftUpdate.safeParse({ status: 'published' }).success).toBe(false); // can't publish by PATCH
  });
});

describe('publishProblems', () => {
  it('is empty when ready', () => expect(publishProblems(ready, verified)).toEqual([]));

  it('lists what is missing, by step', () => {
    const steps = publishProblems(
      {
        category: null,
        goalNgwee: null,
        title: '',
        story: { whatHappened: '', moneyFor: '', extra: '' },
      },
      { emailVerified: true, phoneVerified: false },
    ).map((p) => p.step);
    expect(steps).toEqual(['category', 'goal', 'story', 'story', 'story', 'account']);
  });

  it('lets funerals skip the goal', () => {
    expect(publishProblems({ ...ready, category: 'funeral', goalNgwee: null }, verified)).toEqual(
      [],
    );
  });
});

describe('PublicCampaign', () => {
  it('has no place for phone numbers or emails', () => {
    const keys =
      JSON.stringify(PublicCampaign.shape) + JSON.stringify(PublicCampaign.shape.organiser.shape);
    expect(keys).not.toMatch(/phone|email/i);
  });
});
