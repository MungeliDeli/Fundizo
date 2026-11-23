import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoogleButton } from './google-button';
import { googleErrorMessage } from './google-errors';

describe('GoogleButton', () => {
  it('starts the Google flow through the /api proxy with an encoded next page', () => {
    render(<GoogleButton next="/c/abc?x=1" />);
    const link = screen.getByRole('link', { name: 'Continue with Google' });
    expect(link).toHaveAttribute('href', '/api/auth/google/start?next=%2Fc%2Fabc%3Fx%3D1');
    expect(link).toHaveAttribute('rel', 'nofollow');
  });
});

describe('googleErrorMessage', () => {
  it('explains known reasons in plain words', () => {
    expect(googleErrorMessage('google_cancelled')).toMatch(/cancelled/);
    expect(googleErrorMessage('google_in_use')).toMatch(/already connected/);
  });

  it('ignores anything else, and never echoes the URL text', () => {
    expect(googleErrorMessage('google_<script>')).toBeNull();
    expect(googleErrorMessage('something')).toBeNull();
    expect(googleErrorMessage(undefined)).toBeNull();
    expect(googleErrorMessage(['google_cancelled', 'x'])).toBeNull();
  });
});
