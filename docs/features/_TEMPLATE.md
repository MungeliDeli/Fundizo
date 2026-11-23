# <ID> — <Feature name>

|                 |                                |
| --------------- | ------------------------------ |
| **Feature IDs** | e.g. D-06, D-09                |
| **Phase**       | 0 / 1 / 2 / 3 / 4              |
| **Status**      | Draft · In progress · Shipped  |
| **Module(s)**   | e.g. `payments`, `ledger`      |
| **Spec**        | link to the SPEC.md section    |
| **Design**      | link to docs/design/… (if any) |
| **ADRs**        | links (if any)                 |

## 1. Summary

Two or three sentences: what it does and for whom.

## 2. User stories / acceptance criteria

- As a … I want … so that …
- [ ] Acceptance criterion (testable)

## 3. Scope

**In:** …
**Out (and where it goes instead):** …

## 4. Flow

Step-by-step or a Mermaid sequence diagram covering the happy path and the main branches.

## 5. API

| Method & path | Auth | Request schema (`packages/shared`) | Response | Idempotent? |
| ------------- | ---- | ---------------------------------- | -------- | ----------- |
|               |      |                                    |          |             |

## 6. Data model

New or changed tables and columns, indexes, unique constraints, migration name. Money columns are `_ngwee bigint`.

## 7. Events and jobs

| Event / queue | Producer | Consumer(s) | Retry policy |
| ------------- | -------- | ----------- | ------------ |
|               |          |             |              |

## 8. Money and ledger impact

Which ledger accounts are debited and credited, with a worked example in ngwee. Write "None" if it doesn't touch money.

| Account | Debit | Credit |
| ------- | ----- | ------ |
|         |       |        |

## 9. Security & privacy (required)

- **Who can do this?** Object-level authorisation rule (e.g. "only the organiser of this campaign, at KYC Level 2").
- **Inputs validated:** schemas and limits.
- **Sensitive data:** what PII is touched, where it's stored, what's masked in logs.
- **Abuse cases:** how someone could misuse this, and the control (rate limit, OTP, cool-off, review…).
- **Audit:** which actions write `audit_logs`.

## 10. Failure modes & edge cases (required)

| Situation                  | What happens | Covered by test? |
| -------------------------- | ------------ | ---------------- |
| Provider timeout / UNKNOWN |              |                  |
| Duplicate request          |              |                  |

## 11. Observability

Logs, metrics, dashboards and alerts added.

## 12. Testing

Unit, integration (Testcontainers), contract (sandbox), e2e: what's covered and where.

## 13. Rollout

Feature flag? Migration order? Backfill? Sandbox vs live config?

## 14. Open questions

## Changelog

| Date | Change | PR  |
| ---- | ------ | --- |
