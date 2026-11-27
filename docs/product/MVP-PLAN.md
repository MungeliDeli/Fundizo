# MVP build plan: one feature at a time, end to end

**Status:** Approved 2026-11-23.

## How we work

We build in **vertical slices**. Each slice is one user-visible capability, built **end to end**: database → API → web UI (mobile and desktop) → tests → docs. Only then do we start the next slice.

For every slice:

1. **Build** on its own branch, `feat/<ID>-<name>`.
2. **Done means:**
   - The database migration, API and UI are all working together. No mocked backends, except external services (SMS, payments), which run behind a fake adapter until their sandbox is set up.
   - Checks pass: typecheck, lint, tests (unit + API integration tests against real Postgres), build.
   - The UI works at phone width (~390 px) **and** desktop width (~1280 px+), in light and dark.
   - The feature doc is in `docs/features/`, and the status is updated in `FEATURES.md`.
3. **Merge** to `main` and push.
4. **Show the user:** what the feature does, in plain words, and where to see it running. Wait for their OK.
5. The next slice starts. **Never two slices at once.**

## What's in the MVP

The MVP is the **Phase 0 + Phase 1 "Must"** features from [FEATURES.md](features/FEATURES.md): one person can sign up, raise money for someone, have both verified, receive mobile money donations, and withdraw safely, with staff tools to oversee it.

**Not in the MVP:** the home feed (U-07) and discover feed (U-08) are Phase 2, because a feed needs campaigns, donations and follows to exist first. Groups, events, USSD and local languages are also Phase 2. The "Should"/"Could" Phase 1 items come after the core loop works (listed at the end).

## Which comes first: accounts, not the feed

**Accounts first (email + password, then Google, then phone; see [ADR 0004](../architecture/decisions/0004-accounts-email-google-phone-later.md)).** Almost every other feature needs to know *who* is acting: creating a campaign, withdrawing, staff review. The feed comes last, because it only shows things the other features create.

## The slices, in order

| # | Slice | Feature IDs | What you'll be able to see and do |
| --- | --- | --- | --- |
| 0 ✅ | **Skeleton** | F-01, F-02 (CI), F-04 (local config) | Monorepo with `apps/api` (NestJS), `apps/web` (Next.js), `packages/shared`; Postgres and Redis in Docker; migrations wired up; GitHub Actions runs checks. A responsive web shell (desktop top bar, mobile bottom bar) shows "API connected". |
| 1 ✅ | **Email sign-up and login** | A-01, A-03 | Sign up with name, email and password → 6-digit code by email (Brevo) → verified and logged in. Log in, log out, log out of other devices, forgot/set password. Responsive auth screens with illustrations; fluid type across the site. |
| 2 ✅ | **Continue with Google** | A-12 | One-tap Google sign-in; links to an existing verified account with the same email. |
| 3 ✅ | **Profile and phone** | A-02, A-13 | Edit name, district, language; add a phone number and verify it by SMS code (required before publishing). |
| 3b ✅ | **Create and publish a campaign** | C-01, C-02, C-03, C-04, C-06, C-07 | The wizard saves each step to the server; publish (needs a verified phone); public campaign page with link previews (O-02). |
| 4 ✅ | **Photos** | C-05 | Upload a cover and up to 10 photos (through the API, [ADR 0005](../architecture/decisions/0005-photo-uploads-through-the-api.md); local disk now, S3 in slice 7), compressed on the phone, EXIF stripped, shown on the page and in link previews. |
| 5 ✅ | **Ledger and background jobs** | F-06, F-09 | Append-only double-entry ledger (enforced in the DB), transactional outbox, BullMQ worker. Visible as: campaign totals are now calculated from the ledger, plus a passing property-test report. |
| 6 ✅ | **Donate (fake provider)** | D-01, D-02, D-03, D-05, D-08, D-09, D-10, U-04 | Guest donates: amount, tip, number, name/anonymous, message → waiting screen → a dev "approve / decline / time out" panel plays the network → ledger entries → live total and donor wall. Idempotent, with no double charge. |
| 8 🟡 | **ZynlePay sandbox (MTN + Airtel)** | D-06, D-07 (via aggregator, [ADR 0002](../architecture/decisions/0002-mvp-providers-zynlepay-brevo-aws.md), [ADR 0008](../architecture/decisions/0008-zynlepay-adapter.md)) | A real `ZynleProvider` behind the same interface; the pretend network stays available. Built and tested against a scripted ZynlePay; switched on once the sandbox keys and ZynlePay's answers (amount units, test numbers) are in. |
| 9 | **Messages and receipts** | N-02, N-04, D-11 | Central message templates; SMS and email receipts after each donation; optional email updates. (Brevo email is already live from slice 1; Brevo SMS from slice 3.) |
| 10 | **Share** | O-01, O-02, O-03, O-04 | Share sheet, pre-written messages, reshare after donating. |
| 11 | **Updates and thank-yous** | U-01, U-02, U-03 | Organiser posts updates; donors are notified; thank donors. |
| 12 | **Staff accounts and admin console** | A-10, T-06, T-07 | Separate admin app with 2FA, roles, audit log, and a support lookup by phone or reference. |
| 13 | **Verify people** | A-04, A-05, T-03 | NRC + selfie upload (encrypted KYC bucket), wallet-name match, staff review queue. |
| 14 | **Verify campaigns** | V-01, V-02, V-03, V-04, V-05, V-06 | Unlock-withdrawals checklist, beneficiary SMS YES/NO, evidence, automatic checks, Verified badge, 30-day timeout. |
| 15 | **Withdrawals** | A-06, P-01, P-02, P-03, P-04, P-05, T-04 | Payout wallets (OTP + 48 h cool-off), available balance, request, staff approval, disbursement via ZynlePay sandbox, tracking. |
| 16 | **Money integrity** | P-06, P-08, P-09, D-12, T-08 | Public money trail, float per network, daily reconciliation (payouts pause on gaps), refunds, finance reports. |
| 17 | **Trust and lifecycle** | T-01, T-02, C-09, C-10, A-07 | Report a campaign, moderation queue, funeral template, pause/end/close, account recovery after a SIM change. |
| 7 (before launch) | **Staging and production on AWS** | F-03, F-04, F-05 | Moved here on 2026-11-27: the owner wants free and pretend services until launch is near. Until then the app runs in the Codespace (share it by making port 3000 public). Then: deploy with secrets in Secrets Manager, error tracking, and every merged slice deploying. |

Each row may split into smaller slices when we plan it. The order may change when the user decides.

**After the core loop (still Phase 1, "Should"/"Could"):** C-08 co-organisers, C-11 browse and search, D-04 cover the fees, V-07 re-verification, P-07 proof of use, O-05–O-08 share images / QR / tracked links / nudges, U-05 words of support, U-06 follow, A-08 notification settings, A-09 privacy controls, N-03 push, N-04 email, T-05 risk flags, B-01/B-02 organiser dashboard.

**Then Phase 2** (groups, events and pledges, feeds, USSD, local languages, Zamtel), behind its phase gate.

## Things the user needs to arrange (ahead of the slice that needs them)

| Needed for | What |
| --- | --- |
| Slice 8 | A ZynlePay sandbox account: API docs, sandbox credentials, test phone numbers for MTN and Airtel, and how callbacks are authenticated |
| Before launch (slice 7) | AWS access for af-south-1 (an IAM Identity Center/SSO user; no root keys), a billing alert, a domain |
| Slice 9 | A Brevo account (free plan) with a verified sender domain for email, plus a small SMS credit pack when we want real SMS |

Direct MTN MoMo and Airtel Money integrations (F-07, F-08) are **not** part of the MVP; they can be added later as extra adapters.
