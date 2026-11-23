import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NAV_ITEMS } from './nav-items';
import { SiteHeader } from './site-header';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('SiteHeader', () => {
  it('has a home link and the desktop navigation', () => {
    render(<SiteHeader user={null} />);
    expect(screen.getByRole('link', { name: 'Fundizo home' })).toHaveAttribute('href', '/');
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    }
  });

  it('offers log in and sign up when signed out', () => {
    render(<SiteHeader user={null} />);
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('shows the account link with initials when signed in', () => {
    render(<SiteHeader user={{ firstName: 'Mary', lastName: 'Banda' }} />);
    expect(screen.getByRole('link', { name: 'Your account (Mary)' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.getByText('MB')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  it('opens and closes the phone menu', async () => {
    const user = userEvent.setup();
    render(<SiteHeader user={null} />);
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getAllByRole('link', { name: NAV_ITEMS[0]?.label })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.getAllByRole('link', { name: NAV_ITEMS[0]?.label })).toHaveLength(1);
  });
});
