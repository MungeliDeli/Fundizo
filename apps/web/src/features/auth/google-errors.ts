import { GoogleSignInError } from '@fundizo/shared';

const MESSAGES: Record<GoogleSignInError, string> = {
  cancelled: 'Google sign-in was cancelled. You can try again, or use your email and password.',
  expired: 'That Google sign-in took too long or was started in another browser. Please try again.',
  unavailable: 'Google sign-in isn’t available right now. Please use your email and password.',
  email_unverified:
    'Google hasn’t confirmed that email address yet, so we can’t use it. Confirm it with Google, or sign up with your email.',
  in_use: 'That Google account is already connected to a different Fundizo account.',
  failed: 'We couldn’t finish signing you in with Google. Please try again.',
};

/** Turns `?error=google_<reason>` into words. Unknown values are ignored (never echoed). */
export function googleErrorMessage(param: string | string[] | undefined): string | null {
  if (typeof param !== 'string' || !param.startsWith('google_')) return null;
  const parsed = GoogleSignInError.safeParse(param.slice('google_'.length));
  return parsed.success ? MESSAGES[parsed.data] : null;
}
