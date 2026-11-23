import { ApiError } from '@/lib/api';

/** One place that turns an API error into words for a form. */
export function formError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'rate_limited' && err.retryAfter) {
      const minutes = Math.ceil(err.retryAfter / 60);
      return `Too many tries. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`;
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

/** Remember the email between sign-up and the code screen without putting it in the URL. */
const PENDING_EMAIL_KEY = 'fz:pending-email';

export function rememberPendingEmail(email: string) {
  try {
    sessionStorage.setItem(PENDING_EMAIL_KEY, email);
  } catch {
    // Private mode or storage blocked: the code screen asks for the email instead.
  }
}

export function readPendingEmail(): string {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearPendingEmail() {
  try {
    sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // ignore
  }
}
