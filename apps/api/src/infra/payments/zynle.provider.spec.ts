import { describe, expect, it, vi } from 'vitest';
import { jsonBodyOf, sectionOf } from '../../../test/fetch-helpers.js';
import { type ZynleConfig, ZynleProvider, fromReference, toReference } from './zynle.provider.js';

const cfg: ZynleConfig = {
  baseUrl: 'https://sandbox.zynlepay.com/zynlepay/jsonapi',
  statusUrl: 'https://sandbox.zynlepay.com/zynlepay/jsonapi/paymentstatus',
  merchantId: 'm-1',
  apiId: 'api-id',
  apiKey: 'api-key-secret',
  callbackToken: 'cb-token-0123456789abcdef0123',
  amountUnit: 'kwacha',
  phoneFormat: 'international',
  feeBasisPoints: 250,
};
const REF = '0b9a5a3c-1f2e-4d5c-8b7a-6e5f4d3c2b1a';
const respond = (body: unknown, httpStatus = 200) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status: httpStatus }));
const sentBody = (f: ReturnType<typeof respond>) => {
  const body = jsonBodyOf(f.mock.calls[0]?.[1]);
  if (!('auth' in body)) return body;
  return { ...body, auth: sectionOf(body, 'auth'), data: sectionOf(body, 'data') };
};
const collect = (p: ZynleProvider, amountNgwee = 11_000) =>
  p.collect({
    reference: REF,
    phoneE164: '+260971234567',
    network: 'AIRTEL',
    amountNgwee,
    description: 'x',
  });

describe('ZynleProvider.collect (runBillPayment)', () => {
  it('sends the documented request: auth + data, our reference, whole kwacha, 260… number', async () => {
    const f = respond({
      response_code: '120',
      transaction_id: 'T-9',
      reference_no: toReference(REF),
    });
    const result = await collect(new ZynleProvider(cfg, f));
    expect(result).toEqual({ accepted: true, providerRef: 'T-9' });
    expect(f.mock.calls[0]?.[0]).toBe(cfg.baseUrl);
    expect(sentBody(f)).toEqual({
      auth: { merchant_id: 'm-1', api_id: 'api-id', api_key: 'api-key-secret', channel: 'momo' },
      data: {
        method: 'runBillPayment',
        sender_id: '260971234567',
        reference_no: '0b9a5a3c1f2e4d5c8b7a6e5f4d3c2b1a',
        amount: '110',
      },
    });
  });

  it('can send ngwee and local numbers instead (both are settings)', async () => {
    const f = respond({ response_code: '120' });
    await collect(new ZynleProvider({ ...cfg, amountUnit: 'ngwee', phoneFormat: 'local' }, f));
    expect(sentBody(f).data).toMatchObject({ amount: '11000', sender_id: '0971234567' });
  });

  it('never rounds money: a part-kwacha amount is refused when the unit is kwacha', async () => {
    await expect(collect(new ZynleProvider(cfg, respond({})), 11_050)).rejects.toThrow(
      /whole kwacha/,
    );
  });

  it('a duplicate reference means it was already sent (follow it with status checks)', async () => {
    expect(await collect(new ZynleProvider(cfg, respond({ response_code: '9906' })))).toEqual({
      accepted: true,
    });
  });

  it.each([
    ['2000', 'not_sent'],
    ['9907', 'not_sent'],
    ['9903', 'not_sent'],
    ['9912', 'declined'],
    ['995', 'declined'],
  ])('refusal %s → %s', async (code, reason) => {
    expect(await collect(new ZynleProvider(cfg, respond({ response_code: code })))).toEqual({
      accepted: false,
      failureReason: reason,
    });
  });

  it('a non-JSON answer is an error (the flow then relies on status checks)', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('<html>502</html>', { status: 502 }));
    await expect(collect(new ZynleProvider(cfg, f))).rejects.toThrow(/non-JSON/);
  });
});

async function status(body: unknown) {
  const f = respond(body);
  const r = await new ZynleProvider(cfg, f).getCollectionStatus(REF, 11_000);
  return { r, f };
}

describe('ZynleProvider.getCollectionStatus (paymentstatus)', () => {
  it('asks with our reference and the API credentials only', async () => {
    const { f } = await status({ response_code: '990' });
    expect(f.mock.calls[0]?.[0]).toBe(cfg.statusUrl);
    expect(sentBody(f)).toEqual({
      api_id: 'api-id',
      api_key: 'api-key-secret',
      reference_no: toReference(REF),
    });
  });

  it('100 is success, with the fee from the rate card (2.5% of K110 = K2.75)', async () => {
    expect((await status({ response_code: '100' })).r).toEqual({
      status: 'SUCCESSFUL',
      feeNgwee: 275,
    });
  });

  it.each([
    [
      { response_code: '995', transaction_result: { code: '895' } },
      { status: 'FAILED', failureReason: 'insufficient_funds' },
    ],
    [
      { response_code: '995', transaction_result: { code: '894' } },
      { status: 'FAILED', failureReason: 'wrong_pin' },
    ],
    [
      { response_code: '995', transaction_result: { code: '889' } },
      { status: 'FAILED', failureReason: 'cancelled' },
    ],
    [{ response_code: '995' }, { status: 'FAILED', failureReason: 'declined' }],
    [{ response_code: '995', transaction_result: { code: '898' } }, { status: 'EXPIRED' }],
    [{ response_code: '995', transaction_result: { code: '899' } }, { status: 'UNKNOWN' }],
    [{ response_code: '990', provider_code: '999' }, { status: 'UNKNOWN' }],
    [{ response_code: '2000' }, { status: 'FAILED', failureReason: 'not_sent' }],
    [{ response_code: '990' }, { status: 'PENDING' }],
    [{ response_code: '9914' }, { status: 'PENDING' }],
    [{ response_code: '500' }, { status: 'PENDING' }],
    [{ something: 'else' }, { status: 'PENDING' }],
  ])('%o → %o', async (body, expected) => {
    expect((await status(body)).r).toEqual(expected);
  });

  it('a failed request is not an answer: keep checking', async () => {
    const f = vi.fn<typeof fetch>(async () => {
      throw new Error('ECONNRESET');
    });
    expect(await new ZynleProvider(cfg, f).getCollectionStatus(REF, 11_000)).toEqual({
      status: 'PENDING',
    });
  });

  it('contradictory answers are never success', async () => {
    for (const code of ['899', '999', '895']) {
      const { r } = await status({ response_code: '100', transaction_result: { code } });
      expect(r.status).toBe('UNKNOWN');
    }
    expect(
      (await status({ response_code: '100', transaction_result: { code: '100' } })).r.status,
    ).toBe('SUCCESSFUL');
  });
});

describe('ZynleProvider callbacks', () => {
  const p = new ZynleProvider(cfg, respond({}));
  const body = {
    reference_no: toReference(REF),
    response_code: '100',
    transaction_status: 'SUCCESS',
  };

  it('accepts only callbacks whose URL ends in our secret token', () => {
    expect(p.parseCallback({ headers: {}, body, pathToken: cfg.callbackToken })).toEqual({
      reference: REF,
    });
    expect(
      p.parseCallback({ headers: {}, body, pathToken: 'wrong-token-0123456789abcdef' }),
    ).toBeNull();
    expect(p.parseCallback({ headers: {}, body })).toBeNull();
  });

  it('ignores callbacks for references that are not ours', () => {
    expect(
      p.parseCallback({ headers: {}, body: { reference_no: 'ABC' }, pathToken: cfg.callbackToken }),
    ).toBeNull();
  });

  it('acknowledges the way ZynlePay expects (130)', () => {
    expect(p.acknowledge({ reference: REF })).toEqual({
      response_code: '130',
      reference_no: toReference(REF),
    });
  });

  it('references round-trip', () => {
    expect(fromReference(toReference(REF))).toBe(REF);
    expect(fromReference(toReference(REF).toUpperCase())).toBe(REF);
  });
});
