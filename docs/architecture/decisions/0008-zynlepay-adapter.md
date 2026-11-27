# 0008. ZynlePay adapter: unsigned callbacks, unconfirmed API details as settings, and ambiguity never wins

- **Status:** Accepted
- **Date:** 2026-11-27
- **Feature IDs:** D-06, D-07

## Context

ZynlePay (ADR 0002) collects from MTN and Airtel through one API:

- `runBillPayment` to start a collection;
- `paymentstatus` to ask about one;
- callbacks to a URL set in their dashboard.

Their public docs leave important gaps:

- what the integer `amount` means;
- the phone number format;
- reference rules;
- what a pending status looks like;
- whether IPs must be whitelisted;
- fees;
- **no signature on callbacks**.

## Decision

1. **Callbacks: secret URL, and still only a hint.** The callback URL ends in a random secret (`ZYNLE_CALLBACK_TOKEN`, compared in constant time). A genuine-looking callback only queues a status check (money rule 7, ADR 0007), so even a leaked secret can't mark a payment paid. We answer with `{"response_code":"130", reference_no}` as ZynlePay expects.
2. **Unconfirmed details are settings with safe defaults, never guesses in code:**
   - `ZYNLE_AMOUNT_UNIT` (`kwacha` | `ngwee`) has **no default**, and the app refuses to start with `PAYMENT_PROVIDER=zynle` until it is set. With `kwacha`, a part-kwacha amount is refused rather than rounded.
   - `ZYNLE_PHONE_FORMAT` (`international` 260… | `local` 0…).
   - `ZYNLE_FEE_BASIS_POINTS`: the fee from the rate card. Recorded in the ledger as in ADR 0007; 0 until known.
   - `ZYNLE_STATUS_URL`: the docs show different paths for sandbox and production.
3. **References:** our attempt UUID without dashes (32 hex characters). It maps back exactly; letters and digits only.
4. **Status mapping:**
   - **Unknown**, never success: an ambiguous network answer (899 / 999), or an outer 100 that contradicts the network's own code.
   - **Expired:** 898.
   - **Failed with a reason:** 889, 891 – 897.
   - **Not an answer** (keep checking; the last scheduled check makes it unknown): 990, 500, 9914, unreadable replies, failed requests.
   - **Duplicate reference** (9906) means "already sent": we follow it with status checks, never a second prompt.
5. **Sandbox only outside production.** Configuration refuses any ZynlePay host but `sandbox.zynlepay.com` unless `NODE_ENV=production`.
6. **Contract checks:**
   - a probe script (`pnpm --filter @fundizo/api zynle:probe`) talks to the real sandbox with the developer's keys and prints codes only;
   - CI runs the adapter against a scripted ZynlePay (no keys in CI).

## Alternatives considered

| Option                                      | Why not                                                     |
| ------------------------------------------- | ----------------------------------------------------------- |
| Pick the likely amount unit and move on     | A wrong guess charges donors 100× too much or too little    |
| Trust callbacks that carry the right secret | One leak would let anyone mark payments paid                |
| Allowlist ZynlePay's callback IPs           | Not documented; may still be added on top later             |
| Run the contract checks in CI               | Needs real keys in CI; the sandbox may need IP whitelisting |

## Consequences

- Switching to ZynlePay is a configuration change (`PAYMENT_PROVIDER=zynle`), and switching back to the pretend network is too.
- When ZynlePay answers the open questions, we update the settings and this ADR's sibling feature doc (D-06), not the code. A code change is needed only if a real response looks different from the docs.
