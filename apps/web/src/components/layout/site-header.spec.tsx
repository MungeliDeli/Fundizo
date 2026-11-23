import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NAV_ITEMS } from './nav-items';
import { SiteHeader } from './site-header';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('SiteHeader', () => {
  it('has a home link and the desktop navigation', () => {
    render(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Fundizo home' })).toHaveAttribute('href', '/');
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    }
  });

  it('opens and closes the phone menu', async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // Desktop list + phone menu both render the items while open.
    expect(screen.getAllByRole('link', { name: NAV_ITEMS[0]!.label })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.getAllByRole('link', { name: NAV_ITEMS[0]!.label })).toHaveLength(1);
  });
});
