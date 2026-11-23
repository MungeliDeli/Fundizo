# Dependencies: toolchain, packages and libraries

This doc lists what you need installed to run Fundizo, and every important library the code depends on, with what it's for and why we chose it.

- **Source** says where a choice comes from. **Spec** means it was decided in [SPEC.md](product/SPEC.md#architecture-and-tech-stack). **Proposed** means it's recommended but gets confirmed when Phase 0 scaffolding adds it.
- **Exact versions live in the lockfile** (`pnpm-lock.yaml`) once code exists. When you add, remove or replace a dependency, update this file in the same PR.

## 1. Toolchain (install on your machine)

| Tool                    | Version                                           | Purpose                                                | Source                       |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------ | ---------------------------- |
| Node.js                 | Active LTS (24.x); pinned in `.nvmrc` / `engines` | Runtime for API, web, admin and tooling                | Spec (TypeScript everywhere) |
| pnpm                    | 10.x, via Corepack (`corepack enable`)            | Package manager and workspaces                         | Spec                         |
| Turborepo               | 2.x (dev dependency)                              | Monorepo task runner with caching                      | Spec                         |
| Docker + Docker Compose | Current                                           | Local PostgreSQL and Redis; production images          | Spec                         |
| PostgreSQL              | 16                                                | Primary database (ACID ledger, JSONB, later pgvector)  | Spec                         |
| Redis                   | 7.x                                               | BullMQ queues, cache, rate-limit counters              | Spec                         |
| Terraform               | 1.x                                               | Infrastructure as code for AWS                         | Spec                         |
| AWS CLI                 | v2                                                | Access to staging and production (SSO, no static keys) | Spec                         |
| GitHub CLI (`gh`)       | Current                                           | PRs and CI from the terminal                           | Proposed                     |

### Running locally

```bash
corepack enable && pnpm install
pnpm services:up   # Postgres + Redis
pnpm db:migrate
pnpm dev
```

Optional overrides: copy `apps/api/.env.example` → `apps/api/.env` and `apps/web/.env.example` → `apps/web/.env.local`. Dev defaults already match docker-compose.

### Installed now

Exact versions are in the `package.json` files and `pnpm-lock.yaml`. All were at least 14 days old when added.

| Where             | Packages                                                                      | Why                                                                        |
| ----------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| root              | `turbo` 2.11, `typescript` 6.0, `prettier` 3.9                                | Task runner, types, formatting                                             |
| `packages/shared` | `zod` 4.6                                                                     | Contracts shared by API and web                                            |
| `apps/api`        | `@nestjs/core`/`common`/`platform-express` 12.4, `reflect-metadata`, `rxjs`   | Framework (ESM only)                                                       |
| `apps/api`        | `drizzle-orm` 0.45, `drizzle-kit` 0.31, `pg` 8.23                             | Database access and migrations                                             |
| `apps/api`        | `ioredis` 6                                                                   | Redis client (BullMQ arrives in slice 5)                                   |
| `apps/api`        | `nestjs-pino` 5.3, `pino` 10, `pino-http` 11, `pino-pretty` (dev)             | Structured logs with redaction                                             |
| `apps/api`        | `helmet` 8.3                                                                  | Security headers                                                           |
| `apps/api`        | Node's built-in `crypto.argon2`                                               | Password hashing (Argon2id); no extra package                              |
| `apps/api`        | `@nestjs/cli` 12, `@nestjs/testing`, `supertest`, `vitest` 5.1, `oxlint` 1.92 | Build, tests, lint                                                         |
| `apps/web`        | `next` 16.4, `react`/`react-dom` 19.3, `tailwindcss` 4.3                      | Web app and styling                                                        |
| `apps/web`        | `server-only` 0.0.1                                                           | Stops server-only code (session lookup) from being bundled for the browser |
| `apps/web`        | `vitest`, `jsdom`, `@testing-library/*`, `eslint` 9 + `eslint-config-next`    | Tests and lint                                                             |

### Version notes for slice 0

- Pin every package to a version **at least 14 days old**, and set `minimumReleaseAge: 20160` in `pnpm-workspace.yaml` so pnpm enforces it.
- TypeScript: use the newest **6.0.x**; `typescript-eslint` 8.x supports `<6.1`.
- ESLint: use **9.x**; not every plugin in `eslint-config-next` supports ESLint 10 yet.
- Next.js 16 removed `next lint`; run `eslint .` with the flat configs from `eslint-config-next`.

## 2. Backend: `apps/api` (NestJS)

| Package                                                      | Purpose                                                                             | Source   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------- |
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | Framework; the module system maps onto our modular monolith                         | Spec     |
| `@nestjs/config`                                             | Typed config loading (validated with Zod at boot)                                   | Proposed |
| `drizzle-orm`, `drizzle-kit`                                 | Typed SQL queries and migrations, with no hidden behaviour in ledger code           | Spec     |
| `pg`                                                         | PostgreSQL driver                                                                   | Proposed |
| `bullmq`, `@nestjs/bullmq`, `ioredis`                        | Job queues: status polling with back-off, SMS, sweeps, reconciliation, outbox relay | Spec     |
| `@nestjs/websockets`, `socket.io`                            | Live donation status and campaign totals                                            | Spec     |
| `zod`                                                        | Runtime validation via the shared schemas                                           | Spec     |
| `@nestjs/jwt` or `jose`                                      | JWT signing and verification (asymmetric keys)                                      | Proposed |
| `@nestjs/throttler` (Redis store)                            | Rate limiting for OTP, login, donations and reports                                 | Proposed |
| `helmet`                                                     | Security headers                                                                    | Proposed |
| `libphonenumber-js`                                          | E.164 normalisation and validation of Zambian numbers                               | Proposed |
| `otplib` and/or `@simplewebauthn/server`                     | Staff 2FA (TOTP / WebAuthn)                                                         | Proposed |
| `pino`, `nestjs-pino`                                        | Structured JSON logging with redaction of PII paths                                 | Proposed |
| `@sentry/nestjs`                                             | Error tracking                                                                      | Spec     |
| `@opentelemetry/sdk-node` + auto-instrumentations            | Traces and metrics to Grafana Cloud                                                 | Spec     |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`        | Presigned uploads and downloads (media, KYC)                                        | Spec     |
| `@aws-sdk/client-secrets-manager`                            | Load provider keys and the Airtel PIN at runtime                                    | Spec     |
| `@aws-sdk/client-kms`                                        | Field-level encryption for sensitive references                                     | Proposed |
| `sharp`                                                      | Server-side image re-encode to WebP, EXIF strip, resizing                           | Proposed |

Payment and SMS providers are reached over plain HTTPS from our own adapters (`fetch`/`undici`), **not** community SDKs, so we control timeouts, retries, logging and redaction. If a community package is ever adopted, review its source first.

## 3. Public web and admin: `apps/web`, `apps/admin` (Next.js)

| Package                                  | Purpose                                                                    | Source                          |
| ---------------------------------------- | -------------------------------------------------------------------------- | ------------------------------- |
| `next`, `react`, `react-dom`             | SSR pages for link previews and fast 3G loads; the admin is a separate app | Spec                            |
| `tailwindcss`                            | Styling with a small CSS footprint                                         | Spec                            |
| `@tanstack/react-query`                  | Server-state fetching and caching                                          | Proposed                        |
| `react-hook-form`, `@hookform/resolvers` | Forms (the 6-step wizard, donate sheet) validated with shared Zod schemas  | Proposed                        |
| `socket.io-client`                       | Live payment status and totals                                             | Spec                            |
| `next-intl`                              | i18n: English now; Bemba, Nyanja and Tonga in Phase 2                      | Proposed                        |
| `browser-image-compression`              | Compress photos on the phone before upload                                 | Proposed                        |
| `qrcode`                                 | QR codes for share posters (O-06)                                          | Proposed                        |
| `@sentry/nextjs`                         | Front-end error tracking (with PII scrubbing)                              | Spec                            |
| PWA (`@serwist/next` or similar)         | Installable PWA and web push at launch                                     | Spec (PWA) / Proposed (library) |

## 4. Shared: `packages/*`

| Package           | Purpose                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Zod schemas, DTO types, `Ngwee` money type and helpers, phone/network detection, error codes, campaign-type definitions |
| `packages/config` | Shared `tsconfig`, ESLint and Prettier configs (proposed)                                                               |
| `packages/ui`     | Shared React components for web and admin (proposed, only once duplication appears)                                     |

## 5. Testing

| Package                                               | Purpose                                                                           | Source   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| `vitest`                                              | Unit and integration test runner                                                  | Proposed |
| `@testcontainers/postgresql`, `@testcontainers/redis` | Real Postgres and Redis in integration tests                                      | Proposed |
| `fast-check`                                          | Property-based tests for ledger invariants (balanced transactions, no lost ngwee) | Proposed |
| `supertest`                                           | HTTP-level API tests                                                              | Proposed |
| `msw`                                                 | Mock provider HTTP in unit tests (contract tests still hit the sandboxes)         | Proposed |
| `@playwright/test`                                    | End-to-end tests, including a throttled 3G mobile profile                         | Proposed |

## 6. Code quality and security tooling

| Tool                                      | Purpose                                   |
| ----------------------------------------- | ----------------------------------------- |
| `typescript` (strict)                     | Type safety                               |
| `eslint`, `typescript-eslint`, `prettier` | Lint and format                           |
| `lefthook` (or `husky` + `lint-staged`)   | Pre-commit: format, lint, gitleaks        |
| `@commitlint/cli` + config-conventional   | Enforce `feat(ID): …` commit messages     |
| `gitleaks`                                | Secret scanning (pre-commit + CI)         |
| `pnpm audit`, Dependabot or Renovate      | Vulnerable and outdated dependency alerts |
| CodeQL or Semgrep                         | Static analysis in CI                     |
| Trivy                                     | Container image scanning                  |

## 7. External services (accounts needed, not packages)

| Service                             | Used for                                                                                                                                | Phase       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| ZynlePay (Zynle Fintech), sandbox   | MTN and Airtel collections and payouts via one aggregator ([ADR 0002](architecture/decisions/0002-mvp-providers-zynlepay-brevo-aws.md)) | 1 (sandbox) |
| Brevo                               | Transactional email (free plan); SMS for OTP and receipts (prepaid credits)                                                             | 1           |
| MTN MoMo / Airtel Money direct APIs | Later adapters, not MVP                                                                                                                 | Later       |
| Zambian USSD aggregator (TBD)       | USSD donate menu (D-14)                                                                                                                 | 2           |
| AWS (af-south-1)                    | ECS Fargate, RDS, ElastiCache, S3, Secrets Manager, KMS, WAF                                                                            | 0           |
| Sentry, Grafana Cloud               | Errors, traces, dashboards, alerts                                                                                                      | 0           |
| GitHub Actions                      | CI/CD                                                                                                                                   | 0           |

## Rules for adding a dependency

1. Check whether the standard library or an existing dependency already does it.
2. The package should be actively maintained and widely used, with a compatible licence (MIT, Apache-2.0, BSD or ISC). Check for open security issues.
3. For anything in a money, auth or KYC path, read the source.
4. Add it to the correct workspace (never the root unless it's tooling), and record it here.
