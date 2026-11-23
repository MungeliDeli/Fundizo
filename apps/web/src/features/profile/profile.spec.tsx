import { CSRF_HEADER } from '@fundizo/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testUser } from '@/test/fixtures';
import { PhoneForm } from './phone-form';
import { ProfileForm } from './profile-form';
import { PublishReadiness } from './publish-readiness';

const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  Object.values(router).forEach((f) => f.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

const lastBody = () => {
  const init = fetchMock.mock.calls.at(-1)?.[1];
  return JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>;
};

describe('ProfileForm', () => {
  it('saves only when something changed, with PATCH and the CSRF header', async () => {
    fetchMock.mockImplementation(() =>
      json({ user: { ...testUser, province: 'Central', district: 'Kabwe' } }),
    );
    const u = userEvent.setup();
    render(<ProfileForm user={testUser} />);
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await u.selectOptions(screen.getByLabelText('Province'), 'Central');
    await u.type(screen.getByLabelText('Town or district'), 'Kabwe');
    await u.click(save);

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/me/profile');
    expect(init?.method).toBe('PATCH');
    expect(new Headers(init?.headers).get(CSRF_HEADER)).toBe('1');
    expect(lastBody()).toEqual({
      firstName: 'Mary',
      lastName: 'Banda',
      province: 'Central',
      district: 'Kabwe',
      language: 'en',
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('checks names before saving', async () => {
    const u = userEvent.setup();
    render(<ProfileForm user={testUser} />);
    await u.clear(screen.getByLabelText('First name'));
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter your first name.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PhoneForm', () => {
  it('shows the network as you type, texts a code, and confirms on the 6th digit', async () => {
    fetchMock
      .mockImplementationOnce(() => json({ ok: true }, 202))
      .mockImplementationOnce(() => json({ user: { ...testUser, phone: '+260971234567' } }));
    const u = userEvent.setup();
    render(<PhoneForm phone={null} />);

    await u.type(screen.getByLabelText('Mobile number'), '097 123 4567');
    expect(screen.getByText('Airtel')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Text a code to my Airtel number' }));

    expect(await screen.findByText('We texted a code to 097 123 4567.')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/me/phone/code');
    expect(lastBody()).toEqual({ phone: '+260971234567' });

    await u.type(screen.getByLabelText('6-digit code from the text'), '123456');
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/me/phone/verify');
    expect(lastBody()).toEqual({ phone: '+260971234567', code: '123456' });
  });

  it('refuses numbers that are not Zambian mobiles before sending', async () => {
    const u = userEvent.setup();
    render(<PhoneForm phone={null} />);
    await u.type(screen.getByLabelText('Mobile number'), '12345');
    await u.click(screen.getByRole('button', { name: 'Text me a code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a Zambian mobile number');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains a number already used on another account', async () => {
    fetchMock
      .mockImplementationOnce(() => json({ ok: true }, 202))
      .mockImplementationOnce(() =>
        json(
          {
            error: {
              code: 'phone_in_use',
              message: 'That number is already confirmed on another Fundizo account.',
            },
          },
          409,
        ),
      );
    const u = userEvent.setup();
    render(<PhoneForm phone={null} />);
    await u.type(screen.getByLabelText('Mobile number'), '0961234567');
    await u.click(screen.getByRole('button', { name: /Text a code/ }));
    await u.type(await screen.findByLabelText('6-digit code from the text'), '123456');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'already confirmed on another Fundizo account',
    );
  });

  it('shows your confirmed number, private to you', () => {
    render(<PhoneForm phone="+260961234567" />);
    expect(screen.getByText('096 123 4567')).toBeInTheDocument();
    expect(screen.getByText(/only you can see this/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use a different number' })).toBeInTheDocument();
  });
});

describe('PublishReadiness', () => {
  it('lists what is still needed', () => {
    render(<PublishReadiness user={testUser} />);
    expect(screen.getByText('Ready to start a fundraiser?')).toBeInTheDocument();
    expect(screen.getByText(/Phone number confirmed/)).toHaveTextContent('(not done yet)');
  });

  it('says ready once email and phone are confirmed', () => {
    render(<PublishReadiness user={{ ...testUser, phone: '+260961234567' }} />);
    expect(screen.getByText('Ready to start a fundraiser')).toBeInTheDocument();
  });
});
