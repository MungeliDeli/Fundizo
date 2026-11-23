# A-02 / A-13 — Profile and phone confirmation

|                 |                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feature IDs** | A-02 (profile), A-13 (confirm phone number by SMS)                                                                                                                                     |
| **Phase**       | 1 · MVP slice 3                                                                                                                                                                        |
| **Status**      | Shipped (SMS goes to the dev outbox until real SMS is switched on, see below)                                                                                                          |
| **Module(s)**   | API `modules/identity` (`profile.service`, `me.controller`), `infra/sms`; web `features/profile`, `app/account`; shared `profile.ts`, `phone.ts`                                       |
| **ADRs**        | [0002 Providers (Brevo SMS)](../architecture/decisions/0002-mvp-providers-zynlepay-brevo-aws.md), [0004 Accounts](../architecture/decisions/0004-accounts-email-google-phone-later.md) |

## 1. Summary

There is **one kind of account for everyone**; "organiser" is a role a person takes on a fundraiser, not a separate account. The profile page (`/account`) lets anyone edit their name, province, town or district, and the language for emails and texts. They can also add a Zambian mobile number (MTN, Airtel or Zamtel) and confirm it with a 6-digit SMS code.

A **confirmed phone is required before publishing a fundraiser** (verification level 1: email + phone). The "Ready to start a fundraiser?" card shows what's still missing. ID checks for withdrawals (level 2) come in slice 13.

There are no public profile pages for individuals in the MVP (decision 2026-11-23). Donors see the organiser's name, town and verification on each fundraiser. Group and organisation pages are Phase 2.

## 2. What's visible to whom

| Field                                        | Who sees it                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| First and last name, town/district, province | Public on fundraisers you organise (from slice 3b)                        |
| Language                                     | Only you; used for emails and SMS once translations exist (Phase 2, A-11) |
| Phone number                                 | **Only you.** Never shown to donors; used for alerts and, later, payouts  |
| Email                                        | Only you                                                                  |

## 3. Flows

**Profile:** edit fields → **Save changes** (disabled until something changes) → `PATCH /me/profile` → "Saved." The summary card shows "Kabwe, Central".

**Phone:**

1. Type a number. The network (MTN, Airtel or Zamtel) appears as you type, and the button reads "Text a code to my MTN number".
2. `POST /me/phone/code` texts a code: _"Fundizo: your code is 123456. It expires in 10 minutes. Never share it. Fundizo staff will never ask for it."_ That's plain ASCII under 160 characters, so it's billed as one SMS.
3. Enter the 6 digits. It confirms by itself on the 6th digit (`POST /me/phone/verify`).
4. The number is shown as Confirmed, and a security email goes to the account ("Your phone number was confirmed", number masked as `+26096***433`).
5. "Use a different number" repeats the flow; the new number replaces the old one once confirmed.

## 4. API

All routes need a session (`AuthGuard`) and the CSRF header. **No user id appears in any path or body**: every route acts on the session's own user, so one person can't change another's data.

| Method & path           | Body                                                                                                                          | Success               | Errors                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `PATCH /me/profile`     | `UpdateProfileRequest` (names, `province` from the 10 provinces or null, `district` ≤ 60 or empty, `language` en/bem/nya/toi) | 200 `SessionResponse` | `validation_failed` with field messages; unknown fields (e.g. `phone`) rejected |
| `POST /me/phone/code`   | `SendPhoneCodeRequest` (any common way of writing a Zambian mobile number)                                                    | 202 `{ ok }`          | `validation_failed`, `rate_limited`, `sms_failed` (503)                         |
| `POST /me/phone/verify` | `VerifyPhoneRequest` (`phone`, 6-digit `code`)                                                                                | 200 `SessionResponse` | `invalid_code`, `code_expired`, `too_many_attempts`, `phone_in_use` (409)       |

`PublicUser` (only ever returned to its owner) gained `province`, `district`, `language` and `phone` (E.164, null until confirmed).

## 5. Data model (migration `0003_profile_phone`)

- `users`: `province`, `district`, `language` (default `en`, CHECK), `phone_e164` and `phone_verified_at`, which are set together or not at all (CHECK). A **unique index on `phone_e164`** means a number can be confirmed on only one account.
- `one_time_tokens`: new purpose `verify_phone`, plus `target` (the number the code was sent to).

## Switching on real SMS (Brevo)

By default (`SMS_TRANSPORT=outbox`), texts appear on **`/dev/outbox`** and cost nothing. Real SMS uses prepaid Brevo credits:

1. Do the Brevo setup in [A-01 → Setting up Brevo](A-01-email-signup.md#setting-up-brevo) (API key in `apps/api/.env`).
2. In Brevo, buy SMS credits from your plan or billing page. They're sold in packs, and the price per SMS depends on the destination country, so check the rate for Zambia (+260) before buying.
3. In `apps/api/.env`, set:

   ```dotenv
   SMS_TRANSPORT=brevo
   SMS_SENDER=Fundizo   # letters and digits only, up to 11
   ```

4. Restart `pnpm dev`.

Notes:

- Some networks replace alphanumeric sender names with a number; delivery to Zambian networks should be tested on real MTN, Airtel and Zamtel phones before launch.
- Production refuses to start unless `SMS_TRANSPORT=brevo`. Tests never send real SMS.

## 6. Security & privacy

- **Object-level authorisation:** all routes act on the session's own user only.
- **Inputs:** shared Zod schemas, strict; numbers normalised to E.164 by one shared function (`normaliseZambianMobile`); the network is detected by prefix (MTN 96/76, Airtel 97/77, Zamtel 95/75; to be confirmed with the operators before launch).
- **Codes:** 6 digits from a CSPRNG, stored only as an HMAC keyed with `AUTH_SECRET` and bound to the user **and** the number; 10-minute expiry; newest only; 5 wrong tries locks the code.
- **SMS-cost abuse ("SMS pumping"):** limits of 3 codes per account per 15 minutes, **5 per destination number per day across all accounts**, and 10 per IP per hour. Rate-limit keys hash the number.
- **No number enumeration:** whether a number belongs to another account is revealed only after entering the code, i.e. only to whoever holds that phone (`phone_in_use`). The unique index settles races.
- **Logs:** phone numbers only ever masked (`+26096***567`); SMS text and codes never logged. The security email shows the masked number.
- **Provider failures** (e.g. Brevo 402, out of credits) return `sms_failed` ("We couldn't send the text message just now"), never a false "code sent".
- **Tests never read `apps/api/.env`** (since this slice), so a developer's real Brevo or Google keys can't leak into test runs.

## 7. Failure modes & edge cases

| Situation                                   | What happens                                     | Test                  |
| ------------------------------------------- | ------------------------------------------------ | --------------------- |
| Not a Zambian mobile number                 | Plain-words error; nothing sent                  | ✅ API + web + shared |
| Code entered for a different number         | `code_expired` (the code is bound to its number) | ✅ API                |
| 5 wrong codes                               | Locked; ask for a new code                       | ✅ API                |
| Number already confirmed on another account | `phone_in_use` after the code is entered         | ✅ API + web          |
| Too many codes (account or number)          | `rate_limited` with wait time                    | ✅ API                |
| SMS provider down or out of credits         | `sms_failed` (503)                               | ✅ API                |
| Change to a new number                      | New number replaces the old after confirmation   | ✅ API                |
| Extra fields in the profile request         | Rejected (400)                                   | ✅ API                |

## 8. Testing

- **Shared:** phone normalisation, network detection, masking; profile and phone schemas.
- **API:** `test/profile.e2e-spec.ts` (14 tests, real Postgres + Redis, texts read from the SMS outbox); Brevo SMS adapter (fake fetch); config rules (no outbox in production; Brevo key needed for real SMS).
- **Web:** profile form (only saves when changed, PATCH + CSRF), phone flow (network badge, auto-confirm, `phone_in_use`), readiness card.
- **Browser:** full journey in Chromium (sign up → profile → phone code from the outbox → confirmed → readiness green; security email); screenshots at 390 px and 1440 px, light and dark.

## Changelog

| Date       | Change          |
| ---------- | --------------- |
| 2026-11-23 | Slice 3 shipped |
