# 0007. Guest donations: payment attempts, status polling, access tokens and how fees are split

- **Status:** Accepted
- **Date:** 2026-11-24
- **Feature IDs:** D-01 – D-03, D-05, D-08 – D-10, U-04

## Context

Slice 6 lets anyone donate with MTN MoMo or Airtel Money without an account. The money rules (CLAUDE.md 5–8) demand idempotency, callbacks treated as hints, `UNKNOWN` never treated as success, and no path to a double charge. ZynlePay's real API arrives in slice 8, so the flow has to work end to end against a pretend provider first.

Product decisions from 2026-11-24:

- the minimum gift is **K5**;
- the suggested tip is **10%**, with 0/5/10/15% and a custom amount;
- the pretend network charges **2%**, borne in proportion by the gift and the tip.

## Decision

1. **Donation vs payment attempt.**
   - A donation is the gift: amount, tip, name or anonymous, message.
   - Each PIN prompt is a payment attempt. The attempt's id is the provider reference.
   - **The database allows one open attempt per donation** (a partial unique index on `initiated`, `pending` and `unknown`). A new prompt is only possible after a final _failed_ or _expired_ answer.
   - "Send again" therefore appears after the prompt expires, not while it may still be approved. This replaces the mockup's "Send again in 0:12".
2. **Idempotency.**
   - `POST /donations` and `POST /donations/:id/attempts` require an `Idempotency-Key`.
   - The same key and body return the original result; the same key with a different body gets `409 idempotency_conflict`.
   - Concurrent duplicates are resolved by unique indexes.
3. **Everything after the request runs in workers.**
   - The request writes the donation, the attempt and `payment.attempt_created` (outbox), and returns.
   - A worker claims the attempt (`initiated → pending`, so a re-run can't prompt twice), calls `collect`, and schedules status checks at 10 s, 30 s, 1 min, 2 min and 5 min (`PAYMENT_STATUS_CHECKS_MS`).
   - Still pending after the last check → `unknown`, which daily reconciliation settles (slice 16).
4. **Only status checks change state.**
   - A callback is authenticated by the adapter, then only queues an extra check.
   - On `SUCCESSFUL`, one transaction updates the attempt and the donation, posts the ledger entries and writes `donation.confirmed`. Final attempts never change again.
5. **Fee split (SPEC → tips and fees).** For a payment of `total = gift + tip` with network fee `fee`:
   - `feeOnTip = ⌊fee × tip ÷ total⌋` and `feeOnGift = fee − feeOnTip`;
   - Dr provider clearing `total − fee`;
   - Dr network fees `feeOnTip`;
   - Cr campaign `gift − feeOnGift`;
   - Cr tips `tip` (gross; the fee on it is the platform's cost).
6. **Guest access.**
   - The device that started a donation gets an access token (HMAC of the donation id), sent back as `X-Donation-Token`.
   - Without it, a donation is "not found". Nothing extra is stored.
   - The token and the donor's number are kept in the browser's localStorage on that device only.
7. **Live status by polling:** the waiting screen polls every 2 s while pending, every 10 s while unknown. WebSockets (Socket.IO in the spec) can replace this when live totals on busy pages need it.
8. **The pretend provider (`PAYMENT_PROVIDER=fake`, refused in production):**
   - Requests are kept in Redis and expire after 120 s.
   - A dev panel can approve them, decline them (no money / wrong PIN / cancelled), time them out or give an "unclear" answer.
   - Each decision sends a signed callback through the real callback path.

## Alternatives considered

| Option                                                          | Why not                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Allow "Send again" while the first prompt may still be approved | Both could be approved: a double charge                                |
| Trust the callback's status                                     | Forbidden (money rule 7); callbacks can be forged, replayed or lost    |
| Donor accounts or a cookie session for status                   | Guests must give without signing up; a per-donation token is enough    |
| WebSockets now                                                  | More infrastructure; 2 s polling for ≤ 2 minutes is cheap at MVP scale |
| Deduct the whole fee from the gift                              | The spec splits fees in proportion; tips pay their own share           |

## Consequences

- Retry limits: 5 prompts per donation; 30 donation requests per IP and 10 per number per hour.
- `donations.donorCount` moved out of the campaign contract: the payments module owns it (`GET /public/campaigns/:slug/donations`).
- The app login cannot DELETE donations or attempts.
