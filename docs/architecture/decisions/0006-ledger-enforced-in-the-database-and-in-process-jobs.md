# 0006. The ledger is enforced by the database; the app connects with least privilege; jobs run in the API process for now

- **Status:** Accepted
- **Date:** 2026-11-24
- **Feature IDs:** F-06, F-09

## Context

CLAUDE.md's money rules say ledger entries are append-only "enforced with DB grants and a trigger as well as in code", every transaction balances, and side effects go through a transactional outbox to BullMQ workers. Until now the API connected to Postgres as the database owner (a superuser in Docker), so grants could not protect anything, and there was no worker yet.

## Decision

1. **Chart of accounts (MVP):**
   - `campaign_funds` per campaign (credit-normal: we owe it to the beneficiary);
   - `platform_tips` (credit-normal revenue);
   - `network_fees` (debit-normal expense);
   - `provider_clearing` per provider + network (debit-normal asset: money in a collection wallet).

   Provider and network are separate columns (ADR 0002). Accounts are created on first use; no foreign key into other modules' tables.

2. **Three tables:** `ledger_accounts`, `ledger_transactions` (unique `(kind, ref_type, ref_id)`, the idempotency key) and `ledger_entries` (exactly one positive side per line, integer ngwee in `bigint`).
3. **The database enforces the rules, for every role:**
   - `BEFORE UPDATE/DELETE/TRUNCATE` triggers refuse changes to all three tables;
   - a **deferred constraint trigger** refuses, at COMMIT, any transaction with fewer than two entries or with debits ≠ credits.
4. **Least privilege:**
   - Migrations run as the owner (`MIGRATION_DATABASE_URL`).
   - The API connects as its own login (`DATABASE_URL`, `fundizo_api` in dev), a member of the `fundizo_app` group. The group has normal DML on ordinary tables, no UPDATE/DELETE/TRUNCATE on the ledger, and no DDL.
   - `pnpm db:migrate` creates the dev/test/CI login from `DATABASE_URL`. In AWS, infrastructure creates it (slice 7).
   - New tables get DML by default privileges, so a new append-only table must `REVOKE` in its migration.
5. **`LedgerService` is the ledger's only public interface:**
   - `post(tx, posting)` runs inside the caller's transaction (money rule 5). It validates, then is idempotent per key: the same lines return the original; different lines throw `LedgerConflictError`.
   - Balance reads.
6. **Outbox → BullMQ:**
   - `OutboxService.add(tx, event, payload)` validates the payload with the event's Zod schema and writes it in the caller's transaction. Payloads carry ids only.
   - A relay polls (`FOR UPDATE SKIP LOCKED`) and queues one job per (event, handler), with job id `<event>.<handler>`, so re-relaying can't duplicate.
   - The worker re-reads the event from Postgres and re-validates it. It retries with exponential backoff (8 tries) and fails malformed jobs at once.
   - Handlers must be safe to run twice.
7. **Relay and worker run inside the API process** (`JOBS_ENABLED`, default on). Tests turn them off unless they test jobs.

## Alternatives considered

| Option                                            | Why not                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Enforce in code only                              | One bug or one manual SQL session could rewrite money history                                                                |
| Stored `balance` column updated with each posting | Forbidden by money rule 2; drifts                                                                                            |
| A separate worker service now                     | Another deployable before there's load; the same code can run as its own ECS service later by starting the app with HTTP off |
| `LISTEN/NOTIFY` instead of polling                | Lower latency but more moving parts; 500 ms polling is enough until payments (slice 6)                                       |

## Consequences

- Test data cleanup must switch triggers off (`session_replication_role = replica`, owner only). `resetData` does this and refuses to run outside `*_test`.
- Anyone writing to the ledger by hand, even staff, has to post a new reversing transaction. That's the point.
- When load grows, split the worker into its own process: `JOBS_ENABLED=true` there, `false` on the web-facing API.
