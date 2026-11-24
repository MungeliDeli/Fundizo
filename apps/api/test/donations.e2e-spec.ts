import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ApiErrorBody,
  CreateDonationResponse,
  DONATION_TOKEN_HEADER,
  DevLedgerResponse,
  DonationResponse,
  type DonationView,
  IDEMPOTENCY_HEADER,
  PublicCampaignResponse,
  PublicDonationsResponse,
} from '@fundizo/shared';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { ENV, parseEnv } from '../src/config/env.js';
import { donations, paymentAttempts } from '../src/db/schema/index.js';
import { DB, type Database } from '../src/infra/database/database.module.js';
import { FakeProvider } from '../src/infra/payments/fake.provider.js';
import { PAYMENT_PROVIDER } from '../src/infra/payments/payment-provider.js';
import { PaymentFlow, settlementLines } from '../src/modules/payments/payment-flow.service.js';
import { publishedCampaign } from './campaign-fixtures.js';
import { createTestApp, resetData } from './helpers.js';

/**
 * Guest donations end to end (D-01 – D-10, U-04) with the pretend provider and real Postgres, Redis
 * and BullMQ: prompt, status checks, settlement into the ledger, retries, and no double charge.
 */
let app: INestApplication<App>;
let db: Database;
let slug: string;

beforeAll(async () => {
  await resetData();
  app = await createTestApp((b) =>
    b.overrideProvider(ENV).useValue({
      ...parseEnv(process.env),
      JOBS_ENABLED: true,
      OUTBOX_POLL_MS: 20,
      JOBS_RETRY_DELAY_MS: 20,
      // Status checks 0.15 s … 0.75 s after the prompt instead of 10 s … 5 min.
      PAYMENT_STATUS_CHECKS_MS: [150, 300, 450, 600, 750],
    }),
  );
  db = app.get(DB);
  ({ slug } = await publishedCampaign(app));
});
afterAll(() => app.close());

const http = () => request(app.getHttpServer());
const gift = (over: object = {}) => ({
  campaignSlug: slug,
  amountNgwee: 10_000,
  tipNgwee: 1_000,
  phone: '096 555 0101',
  anonymous: false,
  donorName: 'Natasha',
  message: 'Get well soon',
  ...over,
});

async function donate(body: object = gift(), key = randomUUID()) {
  const res = await http()
    .post('/donations')
    .set('x-fundizo-csrf', '1')
    .set(IDEMPOTENCY_HEADER, key)
    .send(body);
  return res;
}
async function started(body: object = gift()) {
  const res = await donate(body);
  expect(res.status).toBe(201);
  return CreateDonationResponse.parse(res.body);
}
async function view(id: string, token: string): Promise<DonationView> {
  const res = await http().get(`/donations/${id}`).set(DONATION_TOKEN_HEADER, token).expect(200);
  return DonationResponse.parse(res.body).donation;
}
async function play(id: string, outcome: string) {
  // The prompt is sent by a worker; wait until the fake network has it.
  await until(async () => {
    const res = await http()
      .post(`/dev/payments/donations/${id}/decide`)
      .set('x-fundizo-csrf', '1')
      .send({ outcome });
    return res.status === 200;
  });
}
async function settle(id: string, token: string, status: DonationView['status']) {
  return until(async () => {
    const v = await view(id, token);
    return v.status === status ? v : undefined;
  });
}
async function until<T>(check: () => Promise<T | undefined | false>, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 25));
  }
}
const raised = async () =>
  PublicCampaignResponse.parse((await http().get(`/public/campaigns/${slug}`).expect(200)).body)
    .campaign.raisedNgwee;
const wall = async () =>
  PublicDonationsResponse.parse(
    (await http().get(`/public/campaigns/${slug}/donations`).expect(200)).body,
  );
const errorOf = (res: request.Response) => ApiErrorBody.parse(res.body).error;

describe('a successful gift', () => {
  it('prompts, confirms by status check, and records the money in the ledger', async () => {
    const before = await raised();
    const { donation, accessToken } = await started();
    expect(donation).toMatchObject({
      status: 'pending',
      amountNgwee: 10_000,
      tipNgwee: 1_000,
      totalNgwee: 11_000,
      network: 'MTN',
      phone: '096 555 0101',
      canRetry: false,
    });
    expect(donation.reference).toMatch(/^FZ-[0-9A-F]{8}$/);

    await play(donation.id, 'approve');
    await settle(donation.id, accessToken, 'successful');

    // 2% of K110 = K2.20: K2.00 on the gift, K0.20 on the tip (SPEC example).
    expect((await raised()) - before).toBe(9_800);
    const books = DevLedgerResponse.parse((await http().get('/dev/ledger').expect(200)).body);
    expect(books.totals.balanced).toBe(true);
    const tips = books.accounts.find((a) => a.label === 'Fundizo tips');
    expect(tips?.balanceNgwee).toBe(1_000);
    expect(books.accounts.find((a) => a.label.startsWith('Network fees'))?.balanceNgwee).toBe(20);
    expect(
      books.accounts.find((a) => a.label === 'Mobile money wallet · MTN · via FAKE')?.balanceNgwee,
    ).toBe(10_780);
  });

  it('shows on the donor wall with the name and message, never the number', async () => {
    const w = await wall();
    expect(w.donorCount).toBe(1);
    expect(w.donations[0]).toMatchObject({
      name: 'Natasha',
      amountNgwee: 10_000,
      message: 'Get well soon',
    });
    expect(JSON.stringify(w)).not.toMatch(/555|0101|\+260/);
  });

  it('anonymous gifts show no name', async () => {
    const { donation, accessToken } = await started(
      gift({ anonymous: true, donorName: undefined, phone: '0775550102', message: undefined }),
    );
    expect(donation.network).toBe('AIRTEL');
    await play(donation.id, 'approve');
    await settle(donation.id, accessToken, 'successful');
    const w = await wall();
    expect(w.donorCount).toBe(2);
    expect(w.donations[0]).toMatchObject({ name: null, message: null, amountNgwee: 10_000 });
  });
});

describe('no double charge', () => {
  it('the same idempotency key returns the same donation and sends one prompt', async () => {
    const key = randomUUID();
    const body = gift({ phone: '096 555 0201' });
    const [a, b] = await Promise.all([donate(body, key), donate(body, key)]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const first = CreateDonationResponse.parse(a.body);
    expect(CreateDonationResponse.parse(b.body).donation.id).toBe(first.donation.id);
    const again = CreateDonationResponse.parse((await donate(body, key)).body);
    expect(again.donation.id).toBe(first.donation.id);
    expect(again.accessToken).toBe(first.accessToken);
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.donationId, first.donation.id));
    expect(n).toBe(1);
  });

  it('the same key with a different gift is refused', async () => {
    const key = randomUUID();
    await donate(gift({ phone: '096 555 0202' }), key);
    const res = await donate(gift({ phone: '096 555 0202', amountNgwee: 20_000 }), key);
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('idempotency_conflict');
  });

  it('settling twice records the money once', async () => {
    const { donation, accessToken } = await started(gift({ phone: '096 555 0203' }));
    await play(donation.id, 'approve');
    await settle(donation.id, accessToken, 'successful');
    const before = await raised();
    const [attempt] = await db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.donationId, donation.id));
    const flow = app.get(PaymentFlow);
    await flow.apply(attempt?.id ?? '', { status: 'SUCCESSFUL', feeNgwee: 220 });
    await flow.checkStatus(attempt?.id ?? '', -1);
    expect(await raised()).toBe(before);
  });

  it('only one open attempt per donation, enforced by the database', async () => {
    const { donation } = await started(gift({ phone: '096 555 0204' }));
    await expect(
      db.insert(paymentAttempts).values({
        donationId: donation.id,
        provider: 'FAKE',
        network: 'MTN',
        phoneE164: '+260965550204',
        amountNgwee: 11_000,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
  });
});

describe('failures, retries and unclear answers', () => {
  it('a declined payment explains why and can be tried again with a new prompt', async () => {
    const { donation, accessToken } = await started(gift({ phone: '096 555 0301' }));
    await play(donation.id, 'insufficient_funds');
    const failed = await settle(donation.id, accessToken, 'failed');
    expect(failed).toMatchObject({ failureReason: 'insufficient_funds', canRetry: true });

    const retry = (key: string, body: object = {}) =>
      http()
        .post(`/donations/${donation.id}/attempts`)
        .set('x-fundizo-csrf', '1')
        .set(DONATION_TOKEN_HEADER, accessToken)
        .set(IDEMPOTENCY_HEADER, key)
        .send(body);
    const key = randomUUID();
    const res = await retry(key, { phone: '0775550301' });
    expect(res.status).toBe(201);
    expect(DonationResponse.parse(res.body).donation).toMatchObject({
      status: 'pending',
      network: 'AIRTEL',
      phone: '077 555 0301',
    });
    // Replaying the same retry doesn't create another attempt; a new retry while waiting is refused.
    expect((await retry(key)).status).toBe(201);
    const busy = await retry(randomUUID());
    expect(busy.status).toBe(409);
    expect(errorOf(busy).code).toBe('payment_in_progress');

    await play(donation.id, 'approve');
    await settle(donation.id, accessToken, 'successful');
    expect((await retry(randomUUID())).status).toBe(409);
  });

  it('an expired prompt can be sent again', async () => {
    const { donation, accessToken } = await started(gift({ phone: '096 555 0302' }));
    await play(donation.id, 'expire');
    expect(await settle(donation.id, accessToken, 'expired')).toMatchObject({ canRetry: true });
  });

  it('no final answer is "unknown", never success, and blocks paying again', async () => {
    const { donation, accessToken } = await started(gift({ phone: '096 555 0303' }));
    const v = await settle(donation.id, accessToken, 'unknown');
    expect(v.canRetry).toBe(false);
    const res = await http()
      .post(`/donations/${donation.id}/attempts`)
      .set('x-fundizo-csrf', '1')
      .set(DONATION_TOKEN_HEADER, accessToken)
      .set(IDEMPOTENCY_HEADER, randomUUID())
      .send({});
    expect(res.status).toBe(409);
    // The network answers later: the next check settles it.
    await play(donation.id, 'approve');
    await settle(donation.id, accessToken, 'successful');
  });

  it('an ambiguous network answer stays unknown until it is resolved', async () => {
    const { donation, accessToken } = await started(gift({ phone: '096 555 0304' }));
    await play(donation.id, 'ambiguous');
    await settle(donation.id, accessToken, 'unknown');
    await play(donation.id, 'wrong_pin');
    expect(await settle(donation.id, accessToken, 'failed')).toMatchObject({
      failureReason: 'wrong_pin',
    });
  });
});

describe('callbacks are hints, not truth', () => {
  it('refuses unsigned or forged callbacks', async () => {
    const res = await http()
      .post('/payments/callbacks/fake')
      .send({ reference: randomUUID(), status: 'SUCCESSFUL', timestamp: Date.now() });
    expect(res.status).toBe(401);
  });

  it('a genuine callback claiming success changes nothing until the status check agrees', async () => {
    const { donation, accessToken } = await started(gift({ phone: '096 555 0401' }));
    const [attempt] = await until(async () => {
      const rows = await db
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.donationId, donation.id));
      return rows[0]?.status === 'pending' ? rows : undefined;
    });
    const fake = app.get<FakeProvider>(PAYMENT_PROVIDER);
    const cb = fake.signedCallback(attempt?.id ?? '', 'SUCCESSFUL');
    await http()
      .post('/payments/callbacks/fake')
      .set('x-fake-signature', cb.headers['x-fake-signature'])
      .send(cb.body)
      .expect(200);
    await new Promise((r) => setTimeout(r, 120));
    expect((await view(donation.id, accessToken)).status).toBe('pending');
  });
});

describe('access and validation', () => {
  it('needs the access token to read a donation', async () => {
    const { donation } = await started(gift({ phone: '096 555 0501' }));
    await http().get(`/donations/${donation.id}`).expect(404);
    await http().get(`/donations/${donation.id}`).set(DONATION_TOKEN_HEADER, 'nope').expect(404);
  });

  it('needs an idempotency key', async () => {
    const res = await http().post('/donations').set('x-fundizo-csrf', '1').send(gift());
    expect(res.status).toBe(400);
  });

  it('refuses Zamtel, tiny gifts, floats and unknown fields with field messages', async () => {
    const zamtel = await donate(gift({ phone: '095 123 4567' }));
    expect(errorOf(zamtel).fields?.phone).toMatch(/Zamtel/);
    expect((await donate(gift({ amountNgwee: 400 }))).status).toBe(400);
    expect((await donate(gift({ amountNgwee: 10_000.5 }))).status).toBe(400);
    expect((await donate(gift({ admin: true }))).status).toBe(400);
  });

  it('only for published fundraisers', async () => {
    expect((await donate(gift({ campaignSlug: 'no-such-fundraiser' }))).status).toBe(404);
  });

  it('stores the number in E.164 and never on the wall', async () => {
    const [d] = await db.select().from(donations).limit(1);
    expect(d?.phoneE164).toMatch(/^\+2609\d{8}$|^\+2607\d{8}$/);
  });
});

describe('settlement lines', () => {
  it('always balance, and the campaign and tip each bear their share of the fee', () => {
    for (const [amount, tip, fee] of [
      [10_000, 1_000, 220],
      [500, 0, 10],
      [5_000_000, 500_000, 110_000],
      [777, 123, 19],
    ] as const) {
      const lines = settlementLines({
        campaignId: randomUUID(),
        provider: 'FAKE',
        network: 'MTN',
        amountNgwee: amount,
        tipNgwee: tip,
        feeNgwee: fee,
      });
      const debits = lines.reduce((s, l) => s + (l.debitNgwee ?? 0), 0);
      const credits = lines.reduce((s, l) => s + (l.creditNgwee ?? 0), 0);
      expect(debits).toBe(credits);
      expect(debits).toBe(amount + tip - fee + Math.floor((fee * tip) / (amount + tip)));
    }
  });
});
