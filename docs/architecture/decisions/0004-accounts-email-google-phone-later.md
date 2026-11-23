# 0004. Accounts: email + password and Google sign-in; phone verified later; server-side sessions

- **Status:** Accepted
- **Date:** 2026-11-23
- **Feature IDs:** A-01, A-03, A-12, A-13
- **Supersedes:** the spec's "Phone OTP; short-lived JWT access tokens + rotating refresh tokens" (SPEC → Recommended stack, Auth) and sign-up step 1 ("phone number + OTP")

## Context

The spec made phone + SMS code the only way in. That costs an SMS for every sign-up and login (Brevo SMS is prepaid), and it suits desktop, diaspora and organisation users poorly. The owner wants email + password with email verification, plus "Continue with Google", with the phone added and verified later.

## Decision

1. **Ways in (one account each):**
   - **Email + password** (A-01): the email is verified with a 6-digit code (Brevo email, free).
   - **Continue with Google** (A-12, next slice): Google's verified email; linked to an existing account **only if that account's email is verified**. An unverified account's password is discarded on linking, to stop pre-registration takeover.
   - A Google-only user can **set a password** through "Forgot password", after which both methods work.
2. **Phone** (A-13): added on the profile and verified by SMS code. **Required before publishing a fundraiser**, not at sign-up. Donors still need no account.
3. **Passwords:** Argon2id (Node's built-in `crypto.argon2`; OWASP parameters m = 19 MiB, t = 2, p = 1), stored as a PHC string. 10–128 characters; can't be the email.
4. **Sessions: opaque, server-side** (replaces JWT + refresh). On login, a random 256-bit token goes to the browser in an `HttpOnly; Secure; SameSite=Lax` cookie, and only its SHA-256 hash is stored in `sessions`. 30-day absolute lifetime. "Log out other devices" revokes the other rows. Why: instant revocation, no signing keys to manage, simpler; works for a future mobile app as a bearer token.
5. **CSRF:** every state-changing request must carry the header `X-Fundizo-CSRF: 1`. Browsers can't add a custom header cross-site without a CORS preflight, and the API allows no CORS. Combined with SameSite=Lax.
6. **No account enumeration:** sign-up, resend and forgot-password give the same response whether or not the email exists. An existing account gets an "you already have an account" email instead. Login failures are one generic message.
7. **Rate limits** (Redis): sign-up per IP; login per email + IP; code resends per email; verification attempts per code (max 5); forgot-password per email.

## Consequences

- SMS is needed only for phone verification and receipts, which keeps Brevo SMS costs low.
- Each API request with a session does one indexed lookup in `sessions`.
- The spec's "Sign up (organiser): 3 screens" flow is replaced by email sign-up; see docs/features/A-01-email-signup.md.
