import type { INestApplication } from '@nestjs/common';
import { ApiErrorBody, DevLedgerResponse, PublicCampaignResponse } from '@fundizo/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { publishedCampaign } from './campaign-fixtures.js';
import { browser, createTestApp, resetData } from './helpers.js';

/** Campaign totals come from the ledger (F-06), seen through the dev-only ledger tools. */
let app: INestApplication<App>;
beforeAll(async () => {
  await resetData();
  app = await createTestApp();
});
afterAll(() => app.close());

const raised = async (slug: string) =>
  PublicCampaignResponse.parse(
    (await request(app.getHttpServer()).get(`/public/campaigns/${slug}`).expect(200)).body,
  ).campaign.raisedNgwee;

it('a test donation moves the public total, and the books stay balanced', async () => {
  const { slug } = await publishedCampaign(app);
  expect(await raised(slug)).toBe(0);

  const dev = browser(app);
  await dev
    .post('/dev/ledger/test-donation', {
      campaignSlug: slug,
      amountNgwee: 25_000,
      tipNgwee: 1_500,
      network: 'MTN',
    })
    .expect(201);
  await dev
    .post('/dev/ledger/test-donation', {
      campaignSlug: slug,
      amountNgwee: 10_000,
      tipNgwee: 0,
      network: 'AIRTEL',
    })
    .expect(201);
  expect(await raised(slug)).toBe(35_000);

  const books = DevLedgerResponse.parse(
    (await request(app.getHttpServer()).get('/dev/ledger').expect(200)).body,
  );
  expect(books.totals).toMatchObject({ balanced: true, transactionCount: 2, debitsNgwee: 36_500 });
  expect(books.campaigns.find((c) => c.slug === slug)?.raisedNgwee).toBe(35_000);
  const byLabel = Object.fromEntries(books.accounts.map((a) => [a.label, a.balanceNgwee]));
  expect(byLabel['Fundizo tips']).toBe(1_500);
  expect(byLabel['Mobile money wallet · MTN · via FAKE']).toBe(26_500);
  expect(byLabel['Mobile money wallet · AIRTEL · via FAKE']).toBe(10_000);
  expect(books.recent[0]?.lines).toHaveLength(2);
});

it('refuses bad input and unknown fundraisers', async () => {
  const dev = browser(app);
  const bad = await dev
    .post('/dev/ledger/test-donation', {
      campaignSlug: 'x',
      amountNgwee: 1.5,
      tipNgwee: 0,
      network: 'MTN',
    })
    .expect(400);
  expect(ApiErrorBody.parse(bad.body).error.code).toBe('validation_failed');
  await dev
    .post('/dev/ledger/test-donation', {
      campaignSlug: 'nope',
      amountNgwee: 100,
      tipNgwee: 0,
      network: 'MTN',
    })
    .expect(404);
  await dev
    .post('/dev/ledger/test-donation', {
      campaignSlug: 'nope',
      amountNgwee: 100,
      tipNgwee: 0,
      network: 'MTN',
      extra: true,
    })
    .expect(400);
});
