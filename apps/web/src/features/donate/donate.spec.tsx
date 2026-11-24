import {
  CSRF_HEADER,
  DONATION_TOKEN_HEADER,
  type DonationView,
  IDEMPOTENCY_HEADER,
} from '@fundizo/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DonateForm } from './donate-form';
import { DonationStatus } from './donation-status';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const ID = '0b9a5a3c-1f2e-4d5c-8b7a-6e5f4d3c2b1a';
const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
const view = (over: Partial<DonationView> = {}): DonationView => ({
  id: ID,
  reference: 'FZ-0B9A5A3C',
  status: 'pending',
  failureReason: null,
  amountNgwee: 10_000,
  tipNgwee: 1_000,
  totalNgwee: 11_000,
  network: 'MTN',
  phone: '096 123 4567',
  donorName: 'Natasha',
  anonymous: false,
  campaign: { slug: 'help-mary-abcd', title: 'Help Mary' },
  promptSent: true,
  promptExpiresAt: new Date(Date.now() + 120_000).toISOString(),
  canRetry: false,
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  Object.values(router).forEach((f) => f.mockReset());
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('DonateForm', () => {
  it('suggests a 10% tip, shows the network as you type, and pays with an idempotency key', async () => {
    fetchMock.mockImplementation(() => json({ donation: view(), accessToken: 'tok' }, 201));
    const u = userEvent.setup();
    render(<DonateForm slug="help-mary-abcd" beneficiary="Mary" />);

    expect(screen.getByText('K100 gift · K10 tip')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'K200' }));
    expect(screen.getByText('Total K220')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: '0%' }));
    expect(screen.getByText('Total K200')).toBeInTheDocument();

    await u.type(screen.getByLabelText('Mobile money number'), '0961234567');
    expect(screen.getByText('MTN')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Name on the donor wall'), 'Natasha');
    await u.click(screen.getByRole('button', { name: 'Pay K200 with MTN MoMo' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/f/help-mary-abcd/give/${ID}`));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/donations');
    const headers = new Headers(init?.headers);
    expect(headers.get(CSRF_HEADER)).toBe('1');
    expect(headers.get(IDEMPOTENCY_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      amountNgwee: 20_000,
      tipNgwee: 0,
      phone: '0961234567',
      donorName: 'Natasha',
      anonymous: false,
    });
    // The number and the token are remembered on this device only.
    expect(localStorage.getItem('fz:donor-phone')).toBe('0961234567');
    expect(localStorage.getItem(`fz:donation-token:${ID}`)).toBe('tok');
  });

  it('checks the form before sending anything', async () => {
    const u = userEvent.setup();
    render(<DonateForm slug="help-mary-abcd" beneficiary="Mary" />);
    await u.type(screen.getByLabelText('Mobile money number'), '0951234567');
    await u.click(screen.getByRole('button', { name: /^Pay K110/ }));
    expect(await screen.findByText(/Zamtel isn’t supported yet/)).toBeInTheDocument();
    expect(screen.getByText('Add your name, or give anonymously.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a custom amount and an anonymous gift', async () => {
    fetchMock.mockImplementation(() => json({ donation: view(), accessToken: 'tok' }, 201));
    const u = userEvent.setup();
    render(<DonateForm slug="help-mary-abcd" beneficiary="Mary" />);
    await u.click(screen.getByRole('button', { name: 'Other amount' }));
    await u.type(screen.getByLabelText('Amount in kwacha'), '75');
    await u.click(screen.getByLabelText('Give anonymously'));
    await u.type(screen.getByLabelText('Mobile money number'), '0771234567');
    await u.click(screen.getByRole('button', { name: 'Pay K83 with Airtel Money' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      amountNgwee: 7_500,
      tipNgwee: 800,
      anonymous: true,
    });
  });
});

describe('DonationStatus', () => {
  it('asks the donor to check their phone, then thanks them once confirmed', async () => {
    localStorage.setItem(`fz:donation-token:${ID}`, 'tok');
    fetchMock.mockImplementation((url) => {
      if (String(url).startsWith('/api/public/campaigns/'))
        return json({ error: { code: 'not_found', message: 'Not found.' } }, 404);
      return json({
        donation: view({ status: fetchMock.mock.calls.length > 1 ? 'successful' : 'pending' }),
      });
    });
    render(<DonationStatus donationId={ID} slug="help-mary-abcd" />);
    expect(await screen.findByRole('heading', { name: 'Check your phone' })).toBeInTheDocument();
    expect(screen.getByText('096 123 4567')).toBeInTheDocument();
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get(DONATION_TOKEN_HEADER)).toBe(
      'tok',
    );
    expect(
      await screen.findByRole('heading', { name: 'Thank you, Natasha.' }, { timeout: 4_000 }),
    ).toBeInTheDocument();
  });

  it('never shows an unclear answer as success', async () => {
    localStorage.setItem(`fz:donation-token:${ID}`, 'tok');
    fetchMock.mockImplementation(() => json({ donation: view({ status: 'unknown' }) }));
    render(<DonationStatus donationId={ID} slug="help-mary-abcd" />);
    expect(
      await screen.findByRole('heading', { name: 'We’re confirming with MTN' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Please don’t pay again.')).toBeInTheDocument();
    expect(screen.queryByText(/Thank you/)).not.toBeInTheDocument();
  });

  it('explains a failure and tries again with a new idempotency key', async () => {
    localStorage.setItem(`fz:donation-token:${ID}`, 'tok');
    let retried = false;
    fetchMock.mockImplementation((_url, init) => {
      if (init?.method === 'POST') retried = true;
      return retried
        ? json({ donation: view({ status: 'pending' }) }, init?.method === 'POST' ? 201 : 200)
        : json({
            donation: view({
              status: 'failed',
              failureReason: 'insufficient_funds',
              canRetry: true,
            }),
          });
    });
    const u = userEvent.setup();
    render(<DonationStatus donationId={ID} slug="help-mary-abcd" />);
    expect(await screen.findByText(/There wasn’t enough money in the wallet/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Try again: K110' }));
    expect(await screen.findByRole('heading', { name: 'Check your phone' })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe(`/api/donations/${ID}/attempts`);
    expect(new Headers(post?.[1]?.headers).get(IDEMPOTENCY_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('on another device, explains why the gift can’t be shown', async () => {
    render(<DonationStatus donationId={ID} slug="help-mary-abcd" />);
    expect(
      await screen.findByRole('heading', { name: 'We can’t show this gift here' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
