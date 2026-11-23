import { describe, expect, it, vi } from 'vitest';
import { BrevoMailer } from './brevo.mailer.js';
import { verifyEmailMessage } from './templates.js';

const message = verifyEmailMessage(
  { email: 'mary@example.test', name: 'Mary Banda' },
  'Mary',
  '123456',
  'https://x.test/verify',
);

describe('BrevoMailer', () => {
  it('posts the message to Brevo with the API key header', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ messageId: '<abc@relay>' }), { status: 201 }),
    );
    const mailer = new BrevoMailer(
      'xkeysib-secret',
      { email: 'no-reply@fundizo.test', name: 'Fundizo' },
      fetchImpl,
    );

    await mailer.send(message);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('api-key')).toBe('xkeysib-secret');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '{}')).toMatchObject({
      sender: { email: 'no-reply@fundizo.test', name: 'Fundizo' },
      to: [{ email: 'mary@example.test', name: 'Mary Banda' }],
      subject: '123456 is your Fundizo code',
      tags: ['verify-email'],
    });
  });

  it('throws on a Brevo error so the caller can log it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response('{"code":"unauthorized","message":"Key not found"}', { status: 401 }),
    );
    const mailer = new BrevoMailer('bad-key', { email: 'a@b.test', name: 'Fundizo' }, fetchImpl);
    await expect(mailer.send(message)).rejects.toThrow(/401/);
  });
});

describe('email templates', () => {
  it('escapes user-provided names', () => {
    const m = verifyEmailMessage(
      { email: 'x@y.test' },
      '<script>alert(1)</script>',
      '123456',
      'https://x.test',
    );
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });
});
