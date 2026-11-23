import { describe, expect, it, vi } from 'vitest';
import { BrevoSms } from './brevo.sms.js';

describe('BrevoSms', () => {
  it('posts to Brevo with the sender, a +-less recipient and the transactional type', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ messageId: 1, reference: 'r' }), { status: 201 }),
    );
    await new BrevoSms('xkeysib-secret', 'Fundizo', fetchImpl).send({
      to: '+260961234567',
      text: 'Fundizo code 123456',
      tag: 'verify-phone',
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.brevo.com/v3/transactionalSMS/sms');
    expect(new Headers(init?.headers).get('api-key')).toBe('xkeysib-secret');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '{}')).toEqual({
      sender: 'Fundizo',
      recipient: '260961234567',
      content: 'Fundizo code 123456',
      type: 'transactional',
      tag: 'verify-phone',
    });
  });

  it('throws when Brevo refuses (e.g. 402: out of credits)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('{"message":"not enough credits"}', { status: 402 }),
    );
    await expect(
      new BrevoSms('k', 'Fundizo', fetchImpl).send({ to: '+260961234567', text: 'x', tag: 't' }),
    ).rejects.toThrow(/402/);
  });
});
