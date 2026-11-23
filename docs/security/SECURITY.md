# Fundizo security

Fundizo holds other people's money and their most sensitive data: NRC images, selfies, health stories and phone numbers. Security is a product feature, not a phase. This doc holds the threat model, the controls and the checklists. The short, non-negotiable version is in [CLAUDE.md](../../CLAUDE.md#security-rules-summary--details-and-the-threat-model-are-in-docssecuritysecuritymd).

Baselines: **OWASP ASVS Level 2** for the public app and API, **Level 3** for the payments, ledger, payouts and admin surfaces, and the **OWASP API Security Top 10**.

## 1. What we protect

| Asset                               | Why it matters                                             | Where it lives                               |
| ----------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Donated money (ledger, float)       | Theft or loss destroys trust and may be a crime            | Ledger tables; MTN/Airtel wallets            |
| Payout destinations                 | Redirecting a payout is the easiest way to steal           | `payout_destinations`                        |
| KYC data (NRC, selfie, wallet name) | Sensitive personal data under the Data Protection Act 2021 | Encrypted KYC bucket, `kyc_verifications`    |
| Health and funeral stories          | Sensitive personal data                                    | `campaigns.story`, media bucket              |
| Phone numbers                       | Identity and login factor; spam and fraud target           | `users`, `beneficiaries`, `payment_attempts` |
| Provider credentials, Airtel PIN    | Full control of collections and disbursements              | AWS Secrets Manager                          |
| Staff accounts                      | Can approve payouts and see KYC                            | Admin app                                    |

## 2. Threat model (top threats and controls)

| #   | Threat                                                                                                    | Controls                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **Fake or fraudulent campaign** goes viral                                                                | Withdrawals blocked until both the person and the campaign are verified; beneficiary SMS confirmation; evidence; duplicate checks (photo hash, NRC, phone); staff payout approval; donor refund policy                                        |
| T2  | **Account takeover via SIM swap**                                                                         | Recovery and a new SIM need ID re-verification; payout-wallet change needs OTP + 48 h cool-off + notification to the old number; new-device login notifications                                                                               |
| T3  | **Payout redirection** (attacker changes the wallet)                                                      | Same as T2; the wallet's registered name must match KYC; maker-checker for groups; payout queue re-checks the destination before sending                                                                                                      |
| T4  | **Forged or replayed payment callbacks**                                                                  | Callbacks are never trusted alone; status check against the provider before acting; idempotent handlers keyed on our attempt ID; authenticate what the provider supports (signatures, IP allow-list, mTLS); callback URLs carry no secrets    |
| T5  | **Double charge or double credit**                                                                        | Idempotency keys; unique constraints on `(provider, provider_ref)` and the idempotency key; single DB transaction; retries create new attempts; `UNKNOWN` never treated as success                                                            |
| T6  | **Broken object-level authorisation** (seeing or acting on someone else's campaign, payout or donor list) | Policy check in the service layer on every operation, deny by default; tests for "other user's resource → 403/404"; never trust IDs from the client                                                                                           |
| T7  | **OTP abuse** (brute force, SMS pumping or toll fraud)                                                    | 6-digit OTP, hashed, 5-minute TTL, single use, max 5 attempts; rate limits per phone, IP and device; Zambian numbers only for sign-up; CAPTCHA-style challenge after anomalies; SMS spend alerts                                              |
| T8  | **Insider abuse** (staff approves fraud or browses KYC)                                                   | Least-privilege staff roles; 2FA; maker-checker on large payouts and refunds; KYC access audit-logged with a reason; regular access reviews                                                                                                   |
| T9  | **Leaked secrets**                                                                                        | Secrets Manager; secret scanning (gitleaks) in CI and pre-commit; no secrets in the frontend bundle; key rotation runbook                                                                                                                     |
| T10 | **Malicious uploads** (malware, XSS via SVG, GPS leak)                                                    | Presigned uploads with a content-type and size allow-list (JPEG/PNG/WebP/HEIC, PDF for evidence; **no SVG**); server-side re-encode with `sharp` and EXIF strip; files served from a separate domain with `Content-Disposition` and `nosniff` |
| T11 | **Injection and XSS**                                                                                     | Parameterised queries only (Drizzle; no string-built SQL); React escaping; no `dangerouslySetInnerHTML` on user content; strict CSP                                                                                                           |
| T12 | **Money laundering through campaigns**                                                                    | KYC levels; velocity limits; unusual-pattern flags (T-05); FIC suspicious-transaction reporting process                                                                                                                                       |
| T13 | **Data breach**                                                                                           | Encryption at rest (RDS, S3 KMS) and in transit (TLS 1.2+); data minimisation; breach response plan (report to the ODPC **within 24 hours**)                                                                                                  |
| T14 | **Denial of service from a viral campaign**                                                               | Queue-based webhook processing; caching of public pages; autoscaling; rate limits; per-route body size limits                                                                                                                                 |

## 3. Controls by area

### Authentication and sessions

_Implemented in slice 1 ([ADR 0004](../architecture/decisions/0004-accounts-email-google-phone-later.md), [A-01 feature doc](../features/A-01-email-signup.md))._

- **Email + password.** Passwords are hashed with Argon2id (m = 19 MiB, t = 2, p = 1; PHC string). 10–128 characters; can't be the email. When no account matches, a dummy hash still runs, so timing doesn't reveal which emails exist.
- **Email verification:** a 6-digit code from a CSPRNG, stored only as an HMAC keyed with `AUTH_SECRET` (per user). 15-minute expiry, single use, 5 wrong tries locks the code; only the newest code works.
- **Password reset:** a 256-bit one-time link token (HMAC-stored), 30-minute expiry. Using it revokes every session and sends a "password changed" email.
- **No account enumeration:** sign-up, resend and forgot-password answer identically whether or not the email exists; login has one generic error.
- **Sessions:** opaque 256-bit token in an `HttpOnly; Secure; SameSite=Lax` cookie (`fz_session`), 30 days; only its HMAC is stored. Logout revokes it server-side; "log out of other devices" revokes the rest (A-03). Never put tokens in `localStorage`.
- **CSRF:** every state-changing request needs the `X-Fundizo-CSRF: 1` header (rejected otherwise); the API allows no CORS and the browser reaches it only through the same-origin `/api` proxy.
- **Rate limits (Redis):** sign-up per IP; login per email and per IP; code resends per email; verification per email; forgot/reset per email and per IP. Rate-limit keys hash the email.
- **Google sign-in (A-12):** authorization code flow with PKCE; `state` bound to the starting browser by an HttpOnly cookie and usable once; ID token verified (Google's keys, issuer, audience, expiry, nonce, `email_verified`). Accounts are matched by Google's `sub`. Email linking only joins a **confirmed** account; an unconfirmed account's password is discarded on takeover. Details: [A-12 feature doc](../features/A-12-google-signin.md#6-security--privacy).
- **Phone confirmation (A-13):** 6-digit SMS code bound to the user and the number (HMAC), 10 minutes, 5 tries, newest only. SMS-pumping limits: per account, **per destination number across accounts**, and per IP. A number can be confirmed on one account only (unique index), revealed only to whoever holds the phone. Numbers are masked in logs. Details: [A-02 feature doc](../features/A-02-profile-and-phone.md#6-security--privacy).
- Staff: separate auth realm, **mandatory TOTP or WebAuthn**, shorter sessions, IP/geo anomaly alerts. Staff accounts are never also donor or organiser accounts.
- Step-up OTP for sensitive actions: withdrawals, payout-wallet changes, adding co-organisers, account deletion.

### Authorisation

- Central policy functions per module (e.g. `canWithdraw(user, campaign)`), called from services, not only from controllers or guards.
- Roles from the spec: organiser, co-organiser (no withdraw, no wallet change), beneficiary; group owner, treasurer and member; staff admin, moderator, finance and support.
- Use UUIDs for IDs, but **never rely on them being unguessable** for security.
- Every endpoint has a test proving another user gets denied.

### Payments and ledger

- See the money rules in CLAUDE.md. In addition:
  - Unique DB constraints back up every idempotency rule; app checks alone aren't enough.
  - The ledger table is `INSERT`-only for the app role; a trigger rejects `UPDATE` and `DELETE`.
  - A daily reconciliation job matches against provider statements; any gap pauses payouts and alerts finance.
  - Float per network is monitored, with a low-float alert.
  - Provider calls run only from workers with fixed egress IPs (NAT gateway), with sensible timeouts and retries with back-off.

### Data protection (Zambia Data Protection Act 2021)

- Register with the ODPC before launch. Keep a record of processing activities.
- Collect the minimum: no email or date of birth unless needed.
- Donor anonymity: an anonymous donor's name and number are never exposed publicly or to organisers beyond what's necessary (decide and document).
- Retention: delete KYC images N years after account closure (N to be set by the lawyer and FIC rules); provide data export and deletion (A-09).
- Mask PII in logs, errors, analytics and admin lists by default; reveal on demand with an audit entry.
- Don't send PII to AI providers without explicit consent and a processing agreement (Phase 2+).

### Infrastructure (AWS af-south-1)

- Private subnets for the app, DB and Redis; only the load balancer is public. RDS and ElastiCache use encryption at rest and TLS.
- S3 buckets: block public access; the KYC bucket has its own KMS key and a restricted IAM policy; public media goes through a CDN.
- IAM: one task role per service; no long-lived access keys; GitHub Actions deploys via OIDC.
- Terraform for everything; no click-ops in production.
- WAF on the public load balancer; security headers (HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`).
- Backups: PITR of at least 7 days; a quarterly restore drill.

### Secure development lifecycle

- PR template security checklist (see `.github/pull_request_template.md`).
- CI: typecheck, lint, tests, `pnpm audit`, gitleaks, CodeQL (or Semgrep), container image scan (Trivy).
- Dependabot or Renovate for updates; a newly published package version waits at least a week before adoption.
- Changes to the security-critical paths (`ledger`, `payments`, `payouts`, auth, admin) need a second reviewer.
- Run `/security-review` in Claude Code before merging changes to those paths.

## 4. Logging, audit and incident response

- **Audit log** (`audit_logs`): every staff action and every money state change, recording actor, action, target, before/after, reason and IP. Append-only; retained per legal advice.
- **Alerts:** payment success rate drop, callback failures, reconciliation gaps, low float, login-failure and code-verification spikes, SMS spend spikes, and staff login anomalies.
- **Incident response:** detect → contain (pause payouts is a one-switch kill) → assess → notify the ODPC within 24 h if personal data is involved → fix → post-mortem. Runbooks will live in `docs/security/runbooks/` once infrastructure exists.

## 5. Reporting a vulnerability

Until there's a public channel, report privately to the maintainers. Don't open a public GitHub issue for a security problem.
