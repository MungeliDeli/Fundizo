# D-06 / D-07 — MTN and Airtel collections through ZynlePay (sandbox)

|                 |                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feature IDs** | D-06 (MTN MoMo collection), D-07 (Airtel Money collection)                                                                                                                                                                                                        |
| **Phase**       | 1 · MVP slice 8                                                                                                                                                                                                                                                   |
| **Status**      | In progress: adapter built and tested against a scripted ZynlePay; switched on once the sandbox keys and ZynlePay's answers are in                                                                                                                                |
| **Module(s)**   | API `infra/payments/zynle.provider.ts`, `payments-provider.module.ts`, `modules/payments/payment-callbacks*`; script `apps/api/scripts/zynle-probe.mjs`                                                                                                           |
| **ADRs**        | [0002 Providers](../architecture/decisions/0002-mvp-providers-zynlepay-brevo-aws.md), [0007 Guest donations](../architecture/decisions/0007-guest-donations-and-payment-attempts.md), [0008 ZynlePay adapter](../architecture/decisions/0008-zynlepay-adapter.md) |

## 1. Summary

Donations ([D-01](D-01-donate.md)) can now go through **ZynlePay**, a Zambian aggregator for MTN and Airtel, instead of the pretend network. Nothing changes for donors: same screens, same rules. One setting chooses the network: `PAYMENT_PROVIDER=fake` (default) or `zynle`.

## 2. How it talks to ZynlePay

| We do               | ZynlePay call                                                                                                                                          | Notes                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Send the PIN prompt | `POST {ZYNLE_BASE_URL}` with `auth{merchant_id, api_id, api_key, channel:"momo"}` and `data{method:"runBillPayment", sender_id, reference_no, amount}` | `reference_no` = our attempt id without dashes. `120` = initiated; `9906` duplicate = already sent (follow it) |
| Ask how it went     | `POST {ZYNLE_STATUS_URL}` with `{api_id, api_key, reference_no}`                                                                                       | At 10 s, 30 s, 1 min, 2 min, 5 min, plus after each callback                                                   |
| Hear back           | ZynlePay → `POST <public web address>/api/payments/callbacks/zynle/<ZYNLE_CALLBACK_TOKEN>`                                                             | Only triggers a status check. We answer `{"response_code":"130","reference_no":…}`                             |

**Status mapping** (from ZynlePay's code tables):

| ZynlePay says                              | Donor sees                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| 100 (and the network didn't say otherwise) | Thank you; money recorded in the ledger                                  |
| 995 with 895 / 894 / 889                   | Not enough money / wrong PIN / cancelled, with Try again                 |
| 995 with 891 / 897, or 2000, 9905, 9907    | We couldn't send the prompt to that number                               |
| 898                                        | The prompt expired, with Send again                                      |
| 899 / 999, or contradictory codes          | We're confirming… please don't pay again (unknown, **never success**)    |
| 990, 500, 9914, no answer                  | Still waiting; unknown after the last check                              |
| 99xx merchant setup errors                 | Couldn't send the prompt, plus an **error in our logs** to fix the setup |

## 3. Setting it up (development)

1. **Keys:** in `apps/api/.env` (git-ignored), fill in `ZYNLE_MERCHANT_ID`, `ZYNLE_API_ID` and `ZYNLE_API_KEY` from the ZynlePay dashboard. `ZYNLE_CALLBACK_TOKEN` is already generated.
2. **Check the keys:** `pnpm --filter @fundizo/api zynle:probe`. "✓ Keys accepted" means the sandbox answered. `9902` means wrong keys, or the Codespace's IP isn't whitelisted (ask ZynlePay).
3. **Callback URL** (ZynlePay dashboard → callback URL): `<public address of port 3000>/api/payments/callbacks/zynle/<ZYNLE_CALLBACK_TOKEN>`. Make port 3000 **Public** in the Codespace Ports tab and use that address, or run ngrok on port 3000 with your static domain. Callbacks only speed things up: status checks work without them.
4. **Amount unit:** once ZynlePay confirms what `amount` means, set `ZYNLE_AMOUNT_UNIT=kwacha` or `ngwee`. To find out in the sandbox: `zynle:probe deposit 260971234567 10` and see whether the simulator shows K10 or K0.10.
5. **Switch on:** set `PAYMENT_PROVIDER=zynle` and restart `pnpm dev`. Switch back with `fake` any time. The dev "play the network" panel only appears with `fake`.

| Setting                                              | Default                | Meaning                                                  |
| ---------------------------------------------------- | ---------------------- | -------------------------------------------------------- |
| `PAYMENT_PROVIDER`                                   | `fake`                 | `zynle` to use ZynlePay                                  |
| `ZYNLE_BASE_URL`                                     | sandbox jsonapi URL    | Only `sandbox.zynlepay.com` outside production           |
| `ZYNLE_STATUS_URL`                                   | `<base>/paymentstatus` | Production path differs in their docs                    |
| `ZYNLE_MERCHANT_ID`, `ZYNLE_API_ID`, `ZYNLE_API_KEY` | —                      | Secrets (Secrets Manager when deployed)                  |
| `ZYNLE_CALLBACK_TOKEN`                               | —                      | Secret end of the callback URL (24+ URL-safe characters) |
| `ZYNLE_AMOUNT_UNIT`                                  | **none**               | `kwacha` or `ngwee`. Required: we don't guess            |
| `ZYNLE_PHONE_FORMAT`                                 | `international`        | `260971234567` or `0971234567`                           |
| `ZYNLE_FEE_BASIS_POINTS`                             | `0`                    | Rate-card fee (200 = 2%), recorded in the ledger         |

## 4. Open questions for ZynlePay (as of 2026-11-27)

1. Does `amount` mean kwacha or ngwee? Are decimals allowed?
2. Which sandbox test numbers exist for MTN and Airtel, and how do we make one succeed, fail or time out? (`2000` = "no active simulator".)
3. What phone format do `sender_id` / `receiver_id` take?
4. Is IP whitelisting required in the sandbox (`9902`)?
5. What are the reference rules (length, characters)?
6. What does `paymentstatus` return while waiting for the PIN? Does it include the fee or the amount?
7. What is the rate card, and is the fee deducted per payment or billed?
8. Are callbacks signed, or do they come from fixed IPs?
9. Is the production status URL path (`/zynlepay/paymentstatus` vs `/zynlepay/jsonapi/paymentstatus`) a typo?

## 5. Security

- **Keys:** only in `apps/api/.env` (development) or Secrets Manager (deployed). Never logged: request bodies aren't logged, and the probe strips them.
- **No live calls from dev or CI:** configuration refuses non-sandbox hosts outside production.
- **Callbacks:** secret URL token compared in constant time; references validated (32 hex characters, ours); a callback only triggers a status check.
- **Money:** whole units only (no rounding); ambiguous or contradictory answers are unknown, never success; a duplicate reference never causes a second prompt.

## 6. Testing

- **Unit:** `zynle.provider.spec.ts` (30 tests). The exact request bodies, amount units and phone formats, every refusal code, every status code, contradictory answers, failed requests, callback token checks, the `130` acknowledgement and reference round-trips.
- **Integration:** `test/zynle.e2e-spec.ts` (6 tests). The full donation flow with a scripted ZynlePay: the prompt request, success with the rate-card fee in the ledger, decline reasons, unknown after the last check, and callbacks (secret path, acknowledged, a status check decides, refused without the secret).
- **Settings:** `env.spec.ts`. Keys required, no amount-unit guessing, sandbox only outside production.
- **Contract (manual):** `zynle:probe` against the real sandbox. _Pending keys._

## Changelog

| Date       | Change                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| 2026-11-27 | Adapter built; waiting for sandbox keys and ZynlePay's answers to switch on |
