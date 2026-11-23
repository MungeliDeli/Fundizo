## What & why

<!-- Feature IDs (e.g. D-06) and a short description. Title format: feat(D-06): … -->

## How to test

## Checklist

- [ ] Feature doc in `docs/features/` created/updated to match the code
- [ ] `FEATURES.md` status updated (and CSV/XLSX synced or noted)
- [ ] ADR added if an architectural decision was made
- [ ] New dependencies recorded in `docs/DEPENDENCIES.md`
- [ ] Tests added/updated (property tests for ledger, contract tests for adapters)

## Security & money checklist

- [ ] Every endpoint checks object-level authorisation (tests show another user is denied)
- [ ] All inputs validated with shared Zod schemas
- [ ] No secrets, real phone numbers, NRCs or PII in code, fixtures or logs
- [ ] Money as integer ngwee; ledger entries balanced and append-only
- [ ] Money endpoints / provider calls are idempotent; callbacks verified by status check
- [ ] State change + ledger + outbox in one DB transaction
- [ ] Staff and money actions write to `audit_logs`
- [ ] N/A — this PR doesn't touch auth, money, KYC or PII
