# 0001. Baseline architecture and engineering decisions

- **Status:** Accepted
- **Date:** 2026-11-23
- **Feature IDs:** F-01 – F-09

## Context

Fundizo starts from a fresh codebase with a small team. It moves real money over MTN MoMo and Airtel Money and holds sensitive KYC data. These decisions were made in [SPEC.md](../../product/SPEC.md#design-decisions) and are recorded here, together with the engineering conventions that follow from them, so that later ADRs have something to build on or supersede.

## Decisions

### Product and system (from the spec)

| Decision     | Chosen                                                      | Rejected                     | Why                                                                                                                   |
| ------------ | ----------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| System shape | Modular monolith (NestJS)                                   | Microservices                | Small team, one deploy; modules can be split out later (payments first, then AI)                                      |
| Payments     | Direct MTN and Airtel APIs behind `PaymentProvider`         | An aggregator for everything | Lower fees and full control; an aggregator (e.g. Flutterwave) stays a ready fallback adapter if licensing requires it |
| Balances     | Double-entry, append-only ledger                            | A `balance` column           | Provable correctness; audits and reconciliation                                                                       |
| Confirmation | Callback + status polling, both idempotent                  | Callback only                | Callbacks get lost; polling guarantees a final state                                                                  |
| Public pages | Server-rendered Next.js                                     | SPA                          | WhatsApp/Facebook link previews; fast first load on 3G                                                                |
| Language     | TypeScript everywhere; Python only for the later AI service | Django, Go                   | One language across API, web and mobile; shared Zod schemas                                                           |
| Region       | AWS af-south-1 (Cape Town)                                  | EU or US                     | Latency for Zambian users (check data-transfer rules)                                                                 |
| Revenue      | Optional donor tip                                          | Platform % fee               | Keeps giving free; builds trust                                                                                       |
| Data access  | Drizzle + SQL migrations                                    | Heavier ORMs                 | Readable, typed SQL; no hidden behaviour in ledger code                                                               |
| Jobs         | Redis + BullMQ with a transactional outbox                  | Fire-and-forget side effects | Retries, back-off, and atomicity with the business change                                                             |

### Engineering conventions (follow from the above)

| Decision                                                            | Why                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Money is integer ngwee (`bigint`); no floats anywhere               | Floats lose ngwee; reconciliation must match "to the ngwee" (the Phase 0 gate)                                |
| Ledger entries are append-only, enforced by DB grants and a trigger | Code-only rules get bypassed; the DB is the last line of defence                                              |
| Idempotency keys on money endpoints, backed by unique constraints   | Mobile networks and impatient users cause retries; no double charges                                          |
| `UNKNOWN` payment status is first-class and never shown as success  | Airtel's "transaction ambiguous" status and timeouts are real; showing success wrongly causes double payments |
| Each external system has a real adapter plus a fake adapter         | Dev and CI run offline; contract tests hit the sandboxes                                                      |
| Shared Zod schemas in `packages/shared`                             | The same validation in API, web and admin                                                                     |
| Separate admin app and subdomain with staff 2FA                     | Smaller attack surface for the most powerful tools                                                            |
| KYC files in a separate encrypted bucket; presigned URLs only       | Sensitive data under the Data Protection Act; files never pass through app servers                            |
| Feature docs + ADRs required in the same PR as code                 | Keeps the codebase maintainable and understandable                                                            |

## Consequences

- Module boundaries must be policed in review (consider a lint rule restricting cross-module imports).
- Ledger, payments and payouts need the strongest test suites: property-based tests and sandbox contract tests.
- Every new provider (Zamtel, cards, banks) is an adapter plus an ADR, not a redesign.
- Revisit the monolith decision only when one module has scaling or ownership needs the others don't.
