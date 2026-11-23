# 0002. MVP providers: ZynlePay sandbox for mobile money, Brevo for email and SMS, AWS for hosting

- **Status:** Proposed
- **Date:** 2026-11-23
- **Feature IDs:** F-07, F-08, D-06, D-07, P-04, N-01, N-02, N-04, D-11, F-03
- **Partly supersedes:** [0001](0001-baseline-architecture.md), the row "Payments: direct MTN and Airtel APIs", for the MVP only

## Context

The spec planned direct integrations with MTN MoMo and Airtel Money, plus a Zambian SMS aggregator. For the MVP, the owner doesn't want to onboard with MTN, Airtel or a paid SMS aggregator. Free or sandbox services are preferred, and hosting is on AWS. The spec already names a licensed aggregator as the fallback route (licensing risk), so using one first is consistent with the architecture.

## Decision

| Need | Provider for the MVP | Notes |
| --- | --- | --- |
| Mobile money collections and payouts (MTN, Airtel, and Zamtel later) | **ZynlePay** (Zynle Fintech, Zambia), sandbox mode | One `ZynlePayProvider` adapter behind `PaymentProvider`. The *provider* (ZYNLE) is separate from the *network* (MTN, AIRTEL) on each payment attempt. |
| Transactional email (receipts, notifications, staff alerts) | **Brevo**, free plan | Behind a `Mailer` adapter. |
| SMS (OTP, receipts, beneficiary confirmation) | **Brevo transactional SMS**, prepaid credits (SMS is **not** in Brevo's free plan; Zambia +260 is a supported country) | Behind the `Messaging` adapter. Until credits are bought, a **dev outbox adapter** shows messages on a dev-only page. Never enabled in production. |
| Hosting | **AWS**, af-south-1 | As in the spec. |

Every external service still has a **fake adapter** for tests and offline development. Swapping to direct MTN/Airtel APIs or another SMS provider later is a new adapter, not a rewrite.

## Alternatives considered

| Option | Why not (for now) |
| --- | --- |
| Direct MTN MoMo + Airtel Money APIs | Merchant onboarding and contracts; Airtel test access is slow to get. Kept as a later adapter. |
| Other Zambian gateways with public sandboxes (e.g. Lenco, Flutterwave) | Valid fallbacks behind the same interface if ZynlePay's sandbox access is a problem. |
| A Zambian SMS aggregator | Paid contract; not needed until launch volume. |

## Consequences

- **Must confirm with Zynle before the payments slice:** official API docs, sandbox base URL and credentials, test phone numbers, callback authentication, status-check endpoint, refund/reversal support, and disbursement support. Community SDKs are not a reliable source.
- Callbacks from ZynlePay are still hints. Confirm by status check, keep it idempotent, never treat `UNKNOWN` as success (CLAUDE.md money rules).
- Float per *network* becomes float per *provider wallet* while one aggregator holds the money; the ledger accounts follow the provider.
- SMS costs money even in testing. The OTP login slice works with the dev outbox and needs no credits.
- Fees and settlement terms come from Zynle's rate card. Record them before going live.
