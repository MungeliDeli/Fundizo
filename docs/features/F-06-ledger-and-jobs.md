# F-06 / F-09 — Double-entry ledger and background jobs

|                 |                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feature IDs** | F-06 (ledger), F-09 (job queue and outbox)                                                                                                     |
| **Phase**       | 0 · MVP slice 5                                                                                                                                |
| **Status**      | Shipped                                                                                                                                        |
| **Module(s)**   | API `modules/ledger`, `jobs/` (outbox, relay, worker), `modules/notifications` (first handler); `db/migrate.ts`; web `/dev/ledger`             |
| **Spec**        | [SPEC → money flow](../product/SPEC.md), [CLAUDE.md money rules](../../CLAUDE.md#money-rules-never-break-these)                                |
| **ADRs**        | [0006 Ledger enforced by the database; in-process jobs](../architecture/decisions/0006-ledger-enforced-in-the-database-and-in-process-jobs.md) |

## 1. Summary

Every ngwee Fundizo handles is recorded in a **double-entry ledger**: each movement is written twice, where it came from (debit) and where it went (credit). A fundraiser's "raised" figure is now **added up from the ledger** every time, never stored. The database refuses edits, deletes and lopsided entries, and the API connects with a login that isn't allowed to try.

Side effects now run in **background jobs**:

1. a change writes an event in the same database transaction (the **outbox**);
2. a relay hands it to **BullMQ**;
3. a worker runs it, retrying with backoff.

The first job: when a fundraiser is published, the organiser gets a **"Your fundraiser is live"** email.

Real donations arrive in slice 6. Until then, a dev-only **Ledger page** can post pretend donations, so you can watch totals move.

## 2. Acceptance criteria

- [x] Ledger transactions always balance (code + database at COMMIT); property-tested.
- [x] No UPDATE, DELETE or TRUNCATE on ledger tables: refused by triggers (any role) and by grants (app login).
- [x] Posting is idempotent per (kind, business reference); conflicting replays are refused.
- [x] A posting commits or rolls back with the business change around it.
- [x] Campaign "raised" comes from the ledger.
- [x] Events are written in the change's transaction; rolled-back changes emit nothing.
- [x] Jobs retry with backoff; malformed jobs fail without retrying; re-relaying never duplicates.
- [x] Publishing sends the organiser an email from the worker, not inside the request.

## 3. Scope

**In:**

- ledger tables, rules and service;
- least-privilege DB login;
- outbox, relay and worker;
- the CampaignPublished event and its email;
- the dev ledger page.

**Out:**

- donations and payment attempts (slice 6);
- payouts and float checks (slice 15);
- reconciliation (slice 16);
- a separate worker service (when load needs it; ADR 0006).

## 4. How money is recorded

| Account                                      | Grows with | Meaning                              |
| -------------------------------------------- | ---------- | ------------------------------------ |
| `campaign_funds` (per campaign)              | credits    | Money held for that fundraiser       |
| `platform_tips`                              | credits    | Donor tips: Fundizo's revenue        |
| `network_fees` (per provider + network)      | debits     | Charges taken by the networks        |
| `provider_clearing` (per provider + network) | debits     | Money sitting in a collection wallet |

A K250 donation with a K15 tip through MTN (what slice 6 will post when a payment settles):

| Account                   | Debit | Credit |
| ------------------------- | ----- | ------ |
| Mobile money wallet · MTN | K265  |        |
| Held for: the fundraiser  |       | K250   |
| Fundizo tips              |       | K15    |

## 5. Flow: a side effect through the outbox

```mermaid
sequenceDiagram
  participant API as API request
  participant DB as Postgres
  participant R as Outbox relay
  participant Q as BullMQ (Redis)
  participant W as Worker
  API->>DB: BEGIN; publish campaign + outbox_events row; COMMIT
  R->>DB: claim waiting rows (FOR UPDATE SKIP LOCKED)
  R->>Q: one job per handler (jobId = event.handler)
  R->>DB: mark relayed (same transaction)
  W->>Q: take job
  W->>DB: re-read + validate event
  W->>W: run handler (e.g. send "fundraiser is live" email)
  Note over W: throws → retry 5 s, 10 s, 20 s … (8 tries)
```

## 6. Code

| What                                                      | Where                                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Tables                                                    | `apps/api/src/db/schema/ledger.ts`, `platform.ts`                                 |
| Migration (with triggers and grants)                      | `apps/api/src/db/migrations/0006_ledger_and_outbox.sql`                           |
| Posting rules (pure)                                      | `modules/ledger/posting.ts`                                                       |
| `LedgerService.post / balance / campaignFunds / overview` | `modules/ledger/ledger.service.ts`                                                |
| Outbox, handlers, relay, worker                           | `apps/api/src/jobs/`                                                              |
| First event and handler                                   | `modules/campaigns/events.ts`, `modules/notifications/fundraiser-live.handler.ts` |
| Migrations as owner; app login setup                      | `apps/api/src/db/migrate.ts` (`pnpm db:migrate`)                                  |
| Dev ledger API and page                                   | `modules/dev/dev-ledger.controller.ts`, `apps/web/src/app/dev/ledger/page.tsx`    |

**New module interfaces:**

- `campaigns` exports `CampaignDirectory` (read-only summaries);
- `identity` exports `UserContacts` (verified email, for notifications only);
- `ledger` exports `LedgerService`.

## 7. Configuration

| Setting                  | Default                    | Purpose                                                |
| ------------------------ | -------------------------- | ------------------------------------------------------ |
| `DATABASE_URL`           | `postgres://fundizo_api:…` | The API's least-privilege login                        |
| `MIGRATION_DATABASE_URL` | `postgres://fundizo:…`     | Owner; used by `pnpm db:migrate` and test cleanup only |
| `JOBS_ENABLED`           | `true` (tests: `false`)    | Run the relay and worker in this process               |
| `OUTBOX_POLL_MS`         | `500`                      | How often the relay checks for events                  |
| `JOBS_RETRY_DELAY_MS`    | `5000`                     | First retry delay (doubles each try)                   |

**After pulling this slice, run `pnpm db:migrate` once.** It creates the `fundizo_api` login. If your `apps/api/.env` sets `DATABASE_URL` to the owner (`fundizo:`), change it to the line in `.env.example`.

## 8. Security

- **Append-only:**
  - triggers refuse UPDATE/DELETE/TRUNCATE on the ledger, even from the owner;
  - the app login has no such grants either;
  - test cleanup is the only exception (owner + `session_replication_role`, `*_test` databases only).
- **Balance:** the deferred trigger rejects unbalanced transactions at COMMIT, so a bypass of the service still can't write bad books.
- **Payloads:** outbox payloads and job data contain **ids only**. The worker re-reads and re-validates them (Zod) before any handler runs.
- **Correlation:** every request gets an id. Events store it, so logs can be followed from request to job.
- **Dev ledger routes:** only exist outside production. The pretend-donation endpoint validates strictly and only accepts published fundraisers.

## 9. Failure modes

| Situation                              | What happens                                                   | Test        |
| -------------------------------------- | -------------------------------------------------------------- | ----------- |
| Unbalanced posting (code)              | `LedgerError` before any write                                 | ✅ property |
| Unbalanced transaction written by hand | COMMIT fails                                                   | ✅ DB       |
| UPDATE/DELETE/TRUNCATE ledger          | Refused (permission or trigger)                                | ✅ DB       |
| Same posting twice / 10 at once        | One transaction; others get the original                       | ✅ DB       |
| Same key, different amounts            | `LedgerConflictError`                                          | ✅ DB       |
| Business change fails after posting    | Posting rolls back too                                         | ✅ DB       |
| Redis down                             | Events wait in Postgres; relay retries; logged once per outage | manual      |
| Handler throws                         | Retried with backoff, then kept as failed for 7 days           | ✅ jobs     |
| Malformed job / unknown event          | Fails at once, no retries                                      | ✅ jobs     |
| Worker crash after sending email       | Retry skips (per-event "sent" marker)                          | by design   |

## 10. Testing

- **Property-based tests (fast-check):**
  - `posting.spec.ts`: 500 random balanced postings accepted; any one-ngwee imbalance, zero, negative, fractional or unsafe amount rejected; balance mirror rule.
  - `test/ledger.e2e-spec.ts`: random histories against real Postgres, where every balance equals its lines and debits = credits; the accounting equation; idempotency and concurrency; DB enforcement for the app login and for the owner.
- **Jobs:** `test/jobs.e2e-spec.ts`. Delivery, rollback = no event, retries, validation, no duplicates on re-relay, and the publish → email path with a correlation id.
- **Totals:** `test/dev-ledger.e2e-spec.ts`. Pretend donations change the public total; the books stay balanced; strict input.
- **Browser:** `/dev/ledger` at 390 px dark and 1440 px light, with two pretend donations; the public page shows the new total.

## Changelog

| Date       | Change          |
| ---------- | --------------- |
| 2026-11-24 | Slice 5 shipped |
