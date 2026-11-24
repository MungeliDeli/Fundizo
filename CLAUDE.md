# CLAUDE.md — Fundizo engineering guide

This file is loaded into every Claude Code session. Humans should read it too. It holds the rules that are **not negotiable**. The reasoning behind them lives in the docs linked below.

## What Fundizo is

Fundizo is a GoFundMe-style fundraising platform for Zambia. Donors pay with MTN MoMo and Airtel Money (USSD push). Every ngwee is recorded in a double-entry ledger. Campaigns can raise money straight away, but **withdrawals unlock only after the organiser and the campaign are verified.** The only revenue is an optional donor tip; there is no platform fee.

"Harambee" was the working name. If you see it anywhere, it means Fundizo; rename it when you touch that text.

## Current state

- **Building the MVP slice by slice.** The build order and which slices are done (✅) are in [docs/product/MVP-PLAN.md](docs/product/MVP-PLAN.md). Shipped so far: skeleton (API, web, CI), email accounts, Google sign-in, profile + phone confirmation, create and publish a fundraiser, photos, ledger + background jobs, donations (pretend provider). Each shipped feature has a doc in [docs/features/](docs/features/).
- **Work one slice at a time, end to end** (DB → API → web UI → tests → docs). Never build the whole frontend first and wire the backend later. Never start the next slice before the user has seen the current one running and said OK.
- **Per slice:** build it on `feat/<ID>-<name>`. When it works end to end and every check passes, **merge it to `main` yourself** (pre-approved by the user) and push. Then give the user (1) a plain-language explanation of the feature and (2) exactly where to see it (the running link and what to click). Wait for their OK before starting the next slice.
- Ask first only for decisions that are genuinely the user's (product choices, money rules, providers, costs).

## Design reference

- **Design canvas (mockups):** https://claude.ai/code/artifact/b15f329f-a705-43c5-afdd-a49240d5d935. Read it with the Artifact tool (`list_files`, then `read_file` on `project/<Screen>.dc.html`; the colour tokens are in `project/Main.dc.html`). Screens: Campaign, Donate, Paying, ThankYou, Share, Feed, CreateWhat, CreateStory, each in light and dark.
- **The mockups are a direction, not a spec.** They show the idea on a phone only. Keep their look (the Copper & Ink palette, Bricolage Grotesque headings + Inter body, calm cards, big touch targets) and their content and flows. **Don't copy layouts pixel for pixel.**
- **Fundizo is a responsive web app for phones AND desktops.** Design mobile-first, then give desktop a proper layout: top navigation instead of the bottom bar, wider multi-column pages (e.g. campaign story beside a sticky donate card), and sensible max widths. Never just stretch the phone layout or centre a 390 px column on a desktop.
- The mockups say "harambee"; the product is **Fundizo**.
- Palette and type summary: [docs/design/README.md](docs/design/README.md).

## Doc map

| Need                                                              | File                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Product and technical spec (source of truth for _what_ and _why_) | [docs/product/SPEC.md](docs/product/SPEC.md)                           |
| Feature list with stable IDs (canonical)                          | [docs/product/features/FEATURES.md](docs/product/features/FEATURES.md) |
| Architecture, module map, target code layout                      | [docs/architecture/README.md](docs/architecture/README.md)             |
| Decisions and their reasons (ADRs)                                | [docs/architecture/decisions/](docs/architecture/decisions/)           |
| Security: threat model and controls                               | [docs/security/SECURITY.md](docs/security/SECURITY.md)                 |
| Toolchain, packages and libraries                                 | [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)                           |
| Per-feature docs and template                                     | [docs/features/](docs/features/)                                       |
| **MVP build order (what to build next)**                          | [docs/product/MVP-PLAN.md](docs/product/MVP-PLAN.md)                   |
| UX/UI design (and the design canvas link)                         | [docs/design/](docs/design/)                                           |

If the spec and this file ever disagree, stop and ask. Don't silently pick one.

## Workflow rules

1. **Feature IDs everywhere.** Branch `feat/D-06-mtn-collection`; commit `feat(D-06): …` (Conventional Commits: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`); mention the IDs in PR titles.
2. **Docs ship with code.** Every feature gets a doc in `docs/features/` (copy [`_TEMPLATE.md`](docs/features/_TEMPLATE.md)), written before or alongside the code and updated in the same PR. A PR that changes behaviour without updating its feature doc is incomplete.
3. **Update the status** in `FEATURES.md` in the same PR (Not started → In progress → Done). `FEATURES.md` is canonical; keep `FEATURES.csv` and the `.xlsx` in sync, or note that they need regenerating.
4. **New architectural decision → new ADR** in `docs/architecture/decisions/` (copy `0000-template.md`). Never rewrite an accepted ADR; supersede it with a new one.
5. **New dependency → add it to `docs/DEPENDENCIES.md`** with what it's for and why. Prefer well-maintained, widely used packages, and avoid adding a dependency for a few lines of code.
6. **Stay in your phase.** Phase gates are in SPEC.md. Don't build ahead.

## Architecture rules

Modular monolith in TypeScript (NestJS API, Next.js web and admin, shared package). Full picture: [docs/architecture/README.md](docs/architecture/README.md).

- **Module boundaries are hard.** The modules are `identity`, `campaigns`, `payments`, `ledger`, `payouts`, `notifications`, `moderation` (plus audit), and `outreach`. A module exposes a public service interface and domain events. **Never import another module's internals, repositories or tables**; call its public interface or react to its events.
- **Side effects go through the transactional outbox.** Write the domain change and its `outbox_events` row in the **same DB transaction**; BullMQ workers then handle SMS, status polling, receipts and analytics. Never send an SMS or call a provider inside a request transaction.
- **External systems sit behind adapters:** `PaymentProvider`, `Messaging` (SMS), `Mailer` (email), storage, and later an AI gateway. Domain code never imports a vendor SDK directly, and every adapter has a fake for tests and offline dev.
- **MVP providers ([ADR 0002](docs/architecture/decisions/0002-mvp-providers-zynlepay-brevo-aws.md)):** mobile money through the **ZynlePay** aggregator (sandbox) for MTN and Airtel; **Brevo** for email (free plan) and SMS (prepaid credits); **AWS** for hosting. Direct MTN/Airtel APIs are later adapters, not MVP. Keep _provider_ (ZYNLE) and _network_ (MTN/AIRTEL) as separate fields.
- **Campaign types are plug-ins.** Each type (standard, funeral, later event…) defines its rules and a Zod schema for `campaigns.type_config`. Adding a type must not need a schema migration.
- **Shared contracts:** request/response types and Zod schemas live in `packages/shared`, and API, web and admin all validate with the same schemas.
- **Public campaign pages are server-rendered** (link previews for WhatsApp and Facebook, fast first load on 3G).
- **The admin console is a separate app on a separate subdomain**, with staff-only 2FA. It never shares cookies or sessions with the public web.

## Money rules (never break these)

1. **Money is an integer number of ngwee** (`bigint` in Postgres; `bigint` or a branded `Ngwee` type in TS). **No floats, ever**: not in the DB, not in JS math, not in JSON. Format to kwacha only at the display edge.
2. **The ledger is the source of truth.** Balances are _always derived_ from `ledger_entries`; there is no editable `balance` column anywhere.
3. **Ledger entries are append-only.** No `UPDATE` or `DELETE`, enforced with DB grants and a trigger as well as in code. Corrections are new, reversing entries.
4. **Every ledger transaction balances**: the sum of its debits equals the sum of its credits. Enforce this in the ledger service and test it with property-based tests.
5. **One DB transaction** covers the state change, its ledger entries and its outbox event. All or nothing.
6. **Idempotency everywhere money moves.** Every money endpoint (`POST /donations`, withdrawals, refunds) takes an idempotency key. Every provider call uses our payment-attempt ID as its reference. Callback and status-check handlers are safe to run many times.
7. **Callbacks are hints, not truth.** Act only after a status check against the provider confirms the result. Callback endpoints authenticate whatever the provider supports, respond fast, and queue the work.
8. **`UNKNOWN` is never shown or treated as success.** Polling (10 s, 30 s, 1 min, 2 min, 5 min) and daily reconciliation settle it. A retry creates a **new** attempt; there is no path to a double charge.
9. **Payouts pause automatically** while reconciliation shows any unexplained difference, and the payout queue checks network float before sending.
10. **Withdrawals require:** a verified campaign, an ID-verified (Level 2) requester, a verified destination wallet whose registered name matches KYC, OTP confirmation, and staff approval in Phase 1. In groups the requester can **never** approve their own withdrawal.
11. **Phone numbers are stored in E.164 (`+260…`).** Network detection by prefix lives in one shared function.

## Security rules (summary — details and the threat model are in [docs/security/SECURITY.md](docs/security/SECURITY.md))

- **No secrets in code, git, `.env` files in git, logs, or the frontend.** Use AWS Secrets Manager in deployed environments, and an untracked `.env.local` locally, with a committed `.env.example` that holds placeholder values only. The Airtel disbursement PIN is encrypted at call time only and never stored in plaintext or logged.
- **Authorise every request at the object level.** "Is this user allowed to act on _this_ campaign, payout or donation?" is checked in the service layer, never just "is logged in". Deny by default. (Broken object-level authorisation is the #1 API risk.)
- **Validate every input** at the boundary with the shared Zod schemas: HTTP bodies, query strings, webhooks, queue payloads, and file metadata. Reject unknown fields.
- **Auth ([ADR 0004](docs/architecture/decisions/0004-accounts-email-google-phone-later.md)):** email + password (Argon2id) with email verification, and Google sign-in; phone added later and verified by SMS code before publishing. Opaque server-side sessions (hashed in DB, `HttpOnly; Secure; SameSite=Lax` cookie), CSRF header on every state change, no account enumeration, rate limits on every auth endpoint. One-time codes are hashed, short-lived, single-use and attempt-limited. Staff need TOTP/WebAuthn 2FA. Account recovery after a SIM change needs ID re-verification.
- **Sensitive data:** NRC images, selfies and health stories are sensitive under Zambia's Data Protection Act 2021. KYC files go in a **separate encrypted private bucket**, reached only through short-lived presigned URLs and only by staff roles that need them. **Never log** OTPs, tokens, NRC numbers, full phone numbers (mask them as `+26096***123`), PINs or raw KYC data.
- **Uploads:** campaign photos go through the API ([ADR 0005](docs/architecture/decisions/0005-photo-uploads-through-the-api.md)), with a size and content-type allow-list and the format checked from the bytes. Re-encode images server-side and **strip EXIF** (GPS) before anything is stored; never keep the original. KYC files get their own private-bucket decision. Graphic medical images are blurred by default.
- **Sensitive changes need friction:** changing a payout wallet needs OTP, a 48-hour cool-off and a notification to the old number; group wallet changes also need a second approver.
- **Every staff and money action is audit-logged** (`audit_logs`: who, what, when, why, before and after, IP). The log is append-only.
- **Least privilege:** separate DB roles for the app, migrations and read-only reporting; IAM scoped per service; staff roles (admin, moderator, finance, support) see only what their job needs.
- **Rate-limit** OTP, login, donation initiation, report and search endpoints. Apply velocity limits to new accounts.
- **Never send PII to third parties** (AI, analytics) without consent and a data-processing basis.
- **Dependencies:** commit the lockfile, update via Dependabot/Renovate, run `pnpm audit` and secret scanning in CI. Read a new package before adopting it.

## Coding conventions

- TypeScript `strict: true`; no `any` (use `unknown` and narrow it); no non-null `!` without a comment explaining why.
- Errors: typed domain errors mapped to HTTP responses in one place. Never leak stack traces or internals to clients.
- Logging: structured JSON (pino), with a correlation/request ID on every log line and job. Log events, not PII.
- Time: store as UTC `timestamptz`; display in `Africa/Lusaka`.
- DB: Drizzle schema + SQL migrations committed. Migrations are forward-only and reviewed; never edit an applied migration. Every table has `id` (UUID), `created_at` and `updated_at`.
- Names: files `kebab-case.ts`; types and classes `PascalCase`; DB columns `snake_case`; money fields end in `_ngwee`.
- Tests: unit tests next to the code (`*.spec.ts`). Integration tests run against real Postgres and Redis (Testcontainers). Ledger invariants get property-based tests. Provider adapters get contract tests against the free sandboxes. No money-moving PR merges without tests.
- Keep functions small and modules cohesive. Write comments to explain _why_, not _what_.

## Commands

```bash
corepack enable && pnpm install   # Node 24 (.nvmrc); pnpm refuses packages < 14 days old
pnpm services:up                  # Postgres 16 + Redis 7 in Docker (localhost only)
pnpm db:migrate                   # apply migrations as the owner; creates the API's least-privilege login in dev
pnpm dev                          # API on :4000, web on :3000 (browser calls /api/* → API)
pnpm check                        # typecheck + lint + tests, every package (needs services up)
pnpm build                        # production builds
pnpm db:generate                  # schema change → new SQL migration (review it!)
pnpm format                       # prettier
```

The API connects as `fundizo_api` (`DATABASE_URL`, no UPDATE/DELETE on the ledger); migrations use the owner (`MIGRATION_DATABASE_URL`) ([ADR 0006](docs/architecture/decisions/0006-ledger-enforced-in-the-database-and-in-process-jobs.md)). Background jobs (outbox relay + BullMQ worker) run inside the API process (`JOBS_ENABLED`). Dev tools: `/dev/outbox`, `/dev/ledger`, and a "play the network" panel on the donation waiting screen (`PAYMENT_PROVIDER=fake`, [ADR 0007](docs/architecture/decisions/0007-guest-donations-and-payment-attempts.md)).

Local settings: `apps/api/.env` (git-ignored; template `apps/api/.env.example`) holds `WEB_BASE_URL`, `AUTH_SECRET`, the Brevo key and the Google client id and secret (setup: [A-12 doc](docs/features/A-12-google-signin.md#setting-up-google-sign-in)). Put settings there, not in shell variables: Turborepo filters undeclared env vars out of `pnpm dev`. Without a Brevo key, emails appear at `/dev/outbox` (dev only); texts go there too until `SMS_TRANSPORT=brevo` ([A-02 doc → Switching on real SMS](docs/features/A-02-profile-and-phone.md#switching-on-real-sms-brevo)). Tests never read `apps/api/.env`. Brevo setup: [A-01 feature doc → Setting up Brevo](docs/features/A-01-email-signup.md#setting-up-brevo).

Layout: `apps/api` (NestJS 12, ESM: relative imports end in `.js`; modules in `src/modules/<name>/`; infra in `src/infra/`; Drizzle schema in `src/db/schema/`, migrations in `src/db/migrations/`), `apps/web` (Next.js 16; routes in `src/app/` stay thin, product code in `src/features/<area>/`, primitives in `src/components/`, API client in `src/lib/api.ts`), `packages/shared` (Zod contracts; **define every request/response shape here first**). Tooling decisions: [ADR 0003](docs/architecture/decisions/0003-slice-0-tooling.md).

**Definition of done for a slice:** see [MVP-PLAN.md → How we work](docs/product/MVP-PLAN.md#how-we-work). In short: working end to end, checks green, mobile **and** desktop checked, docs updated, pushed, and seen by the user.

## Don'ts

- Don't store or compute money as floats; don't store balances.
- Don't edit or delete ledger entries or audit logs.
- Don't trust a payment callback without a status check.
- Don't reach into another module's tables.
- Don't commit secrets, real phone numbers, NRCs or production data. Use obviously fake fixtures.
- Don't call live payment endpoints (ZynlePay live, MTN, Airtel) from dev or CI; sandbox only. Don't send real SMS from CI.
- Don't build features from a later phase, or skip the feature doc.
