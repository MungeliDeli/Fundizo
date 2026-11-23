import { CSRF_HEADER } from '@fundizo/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';
import { ForgotPasswordForm } from './password-forms';
import { SignupForm } from './signup-form';
import { VerifyEmailForm } from './verify-email-form';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
const user = {
  id: '7f1d4a7e-8a3b-4c2e-9d6f-1a2b3c4d5e6f',
  firstName: 'Mary',
  lastName: 'Banda',
  email: 'mary@example.test',
  emailVerified: true,
  hasPassword: true,
  createdAt: '2026-11-23T10:00:00.000Z',
};

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  sessionStorage.clear();
  Object.values(router).forEach((f) => f.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  return {
    url,
    init,
    body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>,
  };
}

describe('SignupForm', () => {
  async function fill(u: ReturnType<typeof userEvent.setup>, password = 'correct horse battery') {
    await u.type(screen.getByLabelText('First name'), 'Mary');
    await u.type(screen.getByLabelText('Last name'), 'Banda');
    await u.type(screen.getByLabelText('Email'), 'Mary@Example.test');
    await u.type(screen.getByLabelText('Password'), password);
  }

  it('checks the form before calling the API', async () => {
    const u = userEvent.setup();
    render(<SignupForm />);
    await fill(u, 'short');
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs up through the /api proxy with the CSRF header, then goes to the code screen', async () => {
    fetchMock.mockImplementation(() => json({ ok: true }, 202));
    const u = userEvent.setup();
    render(<SignupForm />);
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/verify-email'));
    const { url, init, body } = lastRequest();
    expect(url).toBe('/api/auth/signup');
    expect(new Headers(init?.headers).get(CSRF_HEADER)).toBe('1');
    expect(body).toEqual({
      firstName: 'Mary',
      lastName: 'Banda',
      email: 'mary@example.test',
      password: 'correct horse battery',
    });
    // The email travels to the next screen in sessionStorage, not the URL.
    expect(sessionStorage.getItem('fz:pending-email')).toBe('mary@example.test');
  });

  it('shows server field errors next to the field', async () => {
    fetchMock.mockImplementation(() =>
      json(
        {
          error: {
            code: 'validation_failed',
            message: 'Please check the form and try again.',
            fields: { email: 'That email looks wrong.' },
          },
        },
        400,
      ),
    );
    const u = userEvent.setup();
    render(<SignupForm />);
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('That email looks wrong.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('lets people see the password they typed', async () => {
    const u = userEvent.setup();
    render(<SignupForm />);
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await u.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
  });
});

describe('LoginForm', () => {
  it('logs in and goes to the requested page', async () => {
    fetchMock.mockImplementation(() => json({ user }));
    const u = userEvent.setup();
    render(<LoginForm next="/account" />);
    await u.type(screen.getByLabelText('Email'), 'mary@example.test');
    await u.type(screen.getByLabelText('Password'), 'correct horse battery');
    await u.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/account'));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('shows one generic message for a wrong password', async () => {
    fetchMock.mockImplementation(() =>
      json(
        { error: { code: 'invalid_credentials', message: 'Email or password is incorrect.' } },
        401,
      ),
    );
    const u = userEvent.setup();
    render(<LoginForm next="/account" />);
    await u.type(screen.getByLabelText('Email'), 'mary@example.test');
    await u.type(screen.getByLabelText('Password'), 'nope nope nope');
    await u.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  });

  it('sends unverified accounts to the code screen', async () => {
    fetchMock.mockImplementation(() =>
      json(
        { error: { code: 'email_not_verified', message: 'Please confirm your email first.' } },
        403,
      ),
    );
    const u = userEvent.setup();
    render(<LoginForm next="/account" />);
    await u.type(screen.getByLabelText('Email'), 'mary@example.test');
    await u.type(screen.getByLabelText('Password'), 'correct horse battery');
    await u.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/verify-email?resent=1'));
  });

  it('explains rate limits in minutes', async () => {
    fetchMock.mockImplementation(() =>
      json({ error: { code: 'rate_limited', message: 'Too many tries.', retryAfter: 600 } }, 429),
    );
    const u = userEvent.setup();
    render(<LoginForm next="/account" />);
    await u.type(screen.getByLabelText('Email'), 'mary@example.test');
    await u.type(screen.getByLabelText('Password'), 'correct horse battery');
    await u.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('wait 10 minutes');
  });
});

describe('VerifyEmailForm', () => {
  it('confirms as soon as all 6 digits are typed', async () => {
    sessionStorage.setItem('fz:pending-email', 'mary@example.test');
    fetchMock.mockImplementation(() => json({ user }));
    const u = userEvent.setup();
    render(<VerifyEmailForm />);
    expect(screen.getByText('mary@example.test')).toBeInTheDocument();
    await u.type(screen.getByLabelText('6-digit code'), '12a3456');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/account?welcome=1'));
    expect(lastRequest().body).toEqual({ email: 'mary@example.test', code: '123456' });
    expect(sessionStorage.getItem('fz:pending-email')).toBeNull();
  });

  it('pre-fills from the email link', () => {
    render(<VerifyEmailForm initialEmail="mary@example.test" initialCode="654321" />);
    expect(screen.getByLabelText('6-digit code')).toHaveValue('654321');
  });

  it('asks for the email when it is not known', () => {
    render(<VerifyEmailForm />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows the error for a wrong code', async () => {
    fetchMock.mockImplementation(() =>
      json({ error: { code: 'invalid_code', message: 'That code isn’t right.' } }, 400),
    );
    const u = userEvent.setup();
    render(<VerifyEmailForm initialEmail="mary@example.test" />);
    await u.type(screen.getByLabelText('6-digit code'), '000000');
    expect(await screen.findByRole('alert')).toHaveTextContent('That code isn’t right.');
  });
});

describe('ForgotPasswordForm', () => {
  it('gives the same neutral answer whether or not the account exists', async () => {
    fetchMock.mockImplementation(() => json({ ok: true }, 202));
    const u = userEvent.setup();
    render(<ForgotPasswordForm />);
    await u.type(screen.getByLabelText('Email'), 'someone@example.test');
    await u.click(screen.getByRole('button', { name: 'Email me a link' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'If there’s a Fundizo account for someone@example.test',
    );
  });
});
