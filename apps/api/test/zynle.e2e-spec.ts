import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  CreateDonationResponse,
  DONATION_TOKEN_HEADER,
  DonationResponse,
  type DonationView,
  IDEMPOTENCY_HEADER,
  PublicCampaignResponse,
} from '@fundizo/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { ENV, parseEnv } from '../src/config/env.js';
import { PAYMENT_PROVIDER } from '../src/infra/payments/payment-provider.js';
import {
  type ZynleConfig,
  ZynleProvider,
  toReference,
} from '../src/infra/payments/zynle.provider.js';
import { publishedCampaign } from './campaign-fixtures.js';
import { jsonBodyOf, sectionOf, urlOf } from './fetch-helpers.js';
import { createTestApp, resetData } from './helpers.js';

/**
 * The donation flow through the real ZynlePay adapter (D-06/D-07), with ZynlePay's HTTP API played
 * by a script: the requests we send, the codes we get back, the callback URL with its secret.
 * Contract checks against the real sandbox: `pnpm --filter @fundizo/api zynle:probe`.
 */
const cfg: ZynleConfig = {
  baseUrl: 'https://sandbox.zynlepay.com/zynlepay/jsonapi',
  statusUrl: 'https://sandbox.zynlepay.com/zynlepay/jsonapi/paymentstatus',
  merchantId: 'm-1',
  apiId: 'api-id',
  apiKey: 'api-key',
  callbackToken: 'cb-token-0123456789abcdef0123',
  amountUnit: 'kwacha',
  phoneFormat: 'international',
  feeBasisPoints: 200,
};

/** What "ZynlePay" answers to status checks, per reference. Missing = still in progress (990). */
const answers = new Map<string, unknown>();
const deposits: Array<{ auth: Record<string, unknown>; data: Record<string, unknown> }> = [];
const zynle = vi.fn<typeof fetch>(async (url, init) => {
  const body = jsonBodyOf(init);
  if (urlOf(url) === cfg.statusUrl) {
    const ref = typeof body.reference_no === 'string' ? body.reference_no : '';
    return Response.json(answers.get(ref) ?? { response_code: '990', reference_no: ref });
  }
  const data = sectionOf(body, 'data');
  deposits.push({ auth: sectionOf(body, 'auth'), data });
  return Response.json({
    response_code: '120',
    reference_no: data.reference_no,
    transaction_id: 'ZP-1',
  });
});

let app: INestApplication<App>;
let slug: string;

beforeAll(async () => {
  await resetData();
  app = await createTestApp((b) => {
    b.overrideProvider(ENV).useValue({
      ...parseEnv(process.env),
      JOBS_ENABLED: true,
      OUTBOX_POLL_MS: 20,
      JOBS_RETRY_DELAY_MS: 20,
      PAYMENT_STATUS_CHECKS_MS: [150, 300, 450, 600, 750],
    });
    b.overrideProvider(PAYMENT_PROVIDER).useValue(new ZynleProvider(cfg, zynle));
  });
  ({ slug } = await publishedCampaign(app));
});
afterAll(() => app.close());

const http = () => request(app.getHttpServer());
async function until<T>(check: () => Promise<T | undefined | false>, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 25));
  }
}
async function give(phone: string) {
  const res = await http()
    .post('/donations')
    .set('x-fundizo-csrf', '1')
    .set(IDEMPOTENCY_HEADER, randomUUID())
    .send({ campaignSlug: slug, amountNgwee: 10_000, tipNgwee: 1_000, phone, anonymous: true });
  expect(res.status).toBe(201);
  const created = CreateDonationResponse.parse(res.body);
  // Wait until the prompt went out, and learn which reference was sent.
  const sent = await until(async () =>
    deposits.find((d) => d.data.sender_id === `260${phone.slice(1)}`),
  );
  return {
    ...created,
    reference: typeof sent.data.reference_no === 'string' ? sent.data.reference_no : '',
  };
}
const view = async (id: string, token: string): Promise<DonationView> =>
  DonationResponse.parse(
    (await http().get(`/donations/${id}`).set(DONATION_TOKEN_HEADER, token).expect(200)).body,
  ).donation;
const settle = (id: string, token: string, status: DonationView['status']) =>
  until(async () => {
    const v = await view(id, token);
    return v.status === status ? v : undefined;
  });

it('sends runBillPayment with our reference, whole kwacha and the donor number', async () => {
  const { reference } = await give('0971230001');
  const sent = deposits.at(-1);
  expect(sent?.auth).toEqual({
    merchant_id: 'm-1',
    api_id: 'api-id',
    api_key: 'api-key',
    channel: 'momo',
  });
  expect(sent?.data).toMatchObject({
    method: 'runBillPayment',
    amount: '110',
    sender_id: '260971230001',
  });
  expect(reference).toMatch(/^[0-9a-f]{32}$/);
});

it('a status check saying 100 settles the gift, with the rate-card fee in the ledger', async () => {
  const before = PublicCampaignResponse.parse((await http().get(`/public/campaigns/${slug}`)).body)
    .campaign.raisedNgwee;
  const { donation, accessToken, reference } = await give('0971230002');
  answers.set(reference, { response_code: '100', reference_no: reference, message: 'Successful' });
  await settle(donation.id, accessToken, 'successful');
  const after = PublicCampaignResponse.parse((await http().get(`/public/campaigns/${slug}`)).body)
    .campaign.raisedNgwee;
  expect(after - before).toBe(9_800); // 2% of K110 = K2.20, K2.00 on the gift
});

it('a network decline (995 / 895) explains why', async () => {
  const { donation, accessToken, reference } = await give('0971230003');
  answers.set(reference, { response_code: '995', transaction_result: { code: '895' } });
  expect(await settle(donation.id, accessToken, 'failed')).toMatchObject({
    failureReason: 'insufficient_funds',
    canRetry: true,
  });
});

it('no final answer after the last check is unknown, never success', async () => {
  const { donation, accessToken } = await give('0971230004');
  expect((await settle(donation.id, accessToken, 'unknown')).canRetry).toBe(false);
});

describe('callbacks', () => {
  it('with the secret URL: acknowledged with 130, and only triggers a status check', async () => {
    const { donation, accessToken, reference } = await give('0971230005');
    const calls = () => zynle.mock.calls.filter(([u]) => urlOf(u) === cfg.statusUrl).length;
    const before = calls();
    // The callback claims success, but ZynlePay's status still says "in progress": nothing changes.
    const res = await http()
      .post(`/payments/callbacks/zynle/${cfg.callbackToken}`)
      .send({ reference_no: reference, response_code: '100', transaction_status: 'SUCCESS' })
      .expect(200);
    expect(res.body).toEqual({ response_code: '130', reference_no: reference });
    await until(async () => calls() > before);
    expect((await view(donation.id, accessToken)).status).toBe('pending');
    // Once the status check agrees, it settles.
    answers.set(reference, { response_code: '100' });
    await http()
      .post(`/payments/callbacks/zynle/${cfg.callbackToken}`)
      .send({ reference_no: reference })
      .expect(200);
    await settle(donation.id, accessToken, 'successful');
  });

  it('without the secret, or with the wrong one, is refused', async () => {
    await http()
      .post('/payments/callbacks/zynle')
      .send({ reference_no: toReference(randomUUID()) })
      .expect(401);
    await http()
      .post('/payments/callbacks/zynle/wrong-token-0123456789abcdef')
      .send({ reference_no: toReference(randomUUID()) })
      .expect(401);
    // The fake provider's route doesn't accept ZynlePay callbacks either.
    await http().post('/payments/callbacks/fake').send({}).expect(401);
  });
});
