# C-01 — Create and publish a fundraiser

|                 |                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feature IDs** | C-01 (wizard, autosave), C-02 (who it's for), C-03 (categories), C-04 (story), C-06 (goal and end date), C-07 (preview and publish), O-02 (link previews, text part)                              |
| **Phase**       | 1 · MVP slice 3b                                                                                                                                                                                  |
| **Status**      | Shipped. Photo upload (C-05) and the payout-wallet step (A-06) join the wizard in their own slices.                                                                                               |
| **Module(s)**   | API `modules/campaigns` (new); identity's public `UserDirectory`; web `features/campaigns`, routes `/start`, `/start/[id]/[step]`, `/fundraisers`, `/f/[slug]`; shared `campaigns.ts`, `money.ts` |
| **Design**      | Mockups _CreateWhat_, _CreateStory_, _Campaign_ (direction only); [design README](../design/README.md)                                                                                            |

## 1. Summary

Anyone signed in can start a fundraiser in five short steps. Each step is **saved to the server** when they press Continue, so they can stop and pick up later from **Your fundraisers**. Publishing needs a confirmed email and phone (verification level 1). The fundraiser goes **live immediately** at `/f/<readable-address>`, a server-rendered public page that previews well on WhatsApp and Facebook.

Donations aren't open yet (slice 6): the page shows K0 raised and a disabled "Donations open soon" button. Withdrawals will unlock only after verification (slices 13–15). The page says so calmly ("Verification in progress").

## 2. The wizard

| Step                        | Route                               | Saves                                                                                                                                                                         |
| --------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Who it's for (C-02)       | `/start` (new) or `/start/<id>/who` | Myself, or someone else: their name, how you know them, and optionally their phone (private; for their SMS confirmation later, V-02)                                          |
| 2 What it's for (C-03)      | `…/category`                        | Medical, Funeral, Education, Emergency, Community, Event, Something else. Funeral explains that no goal is needed.                                                            |
| 3 Goal and place (C-06)     | `…/goal`                            | Goal in kwacha, stored as whole ngwee (K100 – K10,000,000, placeholders; optional for funerals); optional end date; province and town (defaults from the organiser's profile) |
| 4 Story (C-04)              | `…/story`                           | Title (10–60 characters, live counter) and three guided prompts: what happened (≥ 40 characters), what the money pays for, anything else. Live preview on wide screens.       |
| 5 Review and publish (C-07) | `…/review`                          | A summary with "Edit" per row, how the link looks in WhatsApp, what's still missing (with "Fix this" links), and **Publish**                                                  |

- **Phones:** a progress bar, one task per screen, and a full-width Continue button.
- **Desktop:** the steps listed on the left (finished ones are links back), the form in the middle, and tips or a live preview on the right.
- "Save and exit" goes to **Your fundraisers** (`/fundraisers`). There, drafts show **Continue**, which picks up at the first unfinished step, and live fundraisers show **View fundraiser**.

## 3. API

Every `/campaigns` route needs a session and the CSRF header, and acts on **the session user's own campaigns only**. Another person's campaign returns **404** (never 403), so its existence isn't revealed.

| Method & path                 | Body                                       | Success                            | Notes                                                                                                                                                         |
| ----------------------------- | ------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /campaigns`             | `CreateCampaignRequest` (beneficiary)      | 201 `{ campaign: OwnCampaign }`    | Draft; 20 per person per day                                                                                                                                  |
| `GET /campaigns/mine`         | —                                          | 200 `{ campaigns }`                | Drafts and live, newest first                                                                                                                                 |
| `GET /campaigns/:id`          | —                                          | 200                                | Owner only; id must be a UUID                                                                                                                                 |
| `PATCH /campaigns/:id`        | `CampaignDraftUpdate` (any subset; strict) | 200                                | Drafts only (409 for live: editing live fundraisers comes with re-verification, V-07). `status`, `slug` and owner can't be set.                               |
| `POST /campaigns/:id/publish` | —                                          | 200                                | Re-checks everything on the server; 422 `not_publishable` with `fields` keyed by step (`category`, `goal`, `story`, `account`). Publishing twice is harmless. |
| `GET /public/campaigns/:slug` | —                                          | 200 `{ campaign: PublicCampaign }` | No session. Published only. `Cache-Control: public, max-age=30`.                                                                                              |

`PublicCampaign` **has no field for any phone number or email**: organiser first and last name, beneficiary name and relationship only. A unit test guards this.

## 4. Data model (migration `0004_campaigns`)

- **`campaigns`:** owner, status (`draft`/`published`), unique `slug`, `type` + `type_config` (campaign-type plug-in; only `standard` today), category, title, `story` (JSON: three parts), **`goal_ngwee` bigint** (whole ngwee, > 0), `end_date`, province, district, `verification_status`, `published_at`. CHECK constraints cover status, category, a positive goal, and "published ⇒ slug and published_at".
- **`campaign_beneficiaries`:** one per campaign; `self`, or `someone_else` with name, relationship and private `phone_e164`.
- **"Raised" is not stored anywhere.** It's 0 until the ledger exists (slice 5) and will always be derived from ledger entries (money rule 2).

**Addresses (slugs):** the title turned into lower-case words plus a random 4-character ending from an easy-to-read alphabet (no 0/o, 1/l/i), e.g. `help-joseph-get-his-heart-surgery-at-uth-dzyn`. A clash is retried.

**Module boundary:** campaigns never read the `users` table. They ask identity's public `UserDirectory` for the organiser's name, place and verification flags (no email or phone).

## 5. The public page (`/f/<slug>`)

- **Phone:** cover, category and place, title, "Mary Banda is organising this fundraiser for Joseph Banda (Brother).", then the progress card (raised, goal, progress bar, "Donations open soon", WhatsApp and Copy link), "Verification in progress", the story, and "Every withdrawal will be shown on this page."
- **Desktop:** the story column on the left, the progress card sticky on the right.
- **Cover:** until photos exist (slice 4), a category illustration on a patterned copper background.
- **Link previews (O-02):** `<title>`, `description`, `og:title`, `og:description`, `og:site_name`, `og:type` and a Twitter card are rendered on the server. `og:image` arrives with photos.
- **"Your fundraiser is live":** a banner shown only to the organiser straight after publishing (checked against their own campaign list), never to visitors.

## 6. Security & privacy

- **Object-level authorisation** in the service: every owner query includes `owner_user_id = session user`. Tests prove another account gets 404 for get, edit and publish, and an empty list.
- **Validation:** shared Zod schemas, strict (unknown fields like `status`, `slug` or `ownerUserId` are rejected); goal must be whole ngwee within limits (decimals rejected); ids are UUIDs; slugs match `^[a-z0-9-]{3,80}$`.
- **Publishing rules are enforced on the server**, not just in the UI. The organiser needs a confirmed email and phone.
- **Personal data:** the beneficiary's phone is visible only to the organiser and never in public responses or HTML. A browser test checks the public HTML contains no phone numbers or emails.
- **Stories may contain health details** (sensitive under the Data Protection Act). Organisers write them on purpose for the public; the prompt asks for what donors need. Moderation and reporting come with T-01/T-02.
- **Rate limit:** 20 new drafts per person per day.
- React escapes all story text; nothing is rendered as HTML.

## 7. Failure modes & edge cases

| Situation                                | What happens                                         | Test                   |
| ---------------------------------------- | ---------------------------------------------------- | ---------------------- |
| Someone opens another person's draft URL | 404 page                                             | ✅ API + browser       |
| Publish with missing pieces              | 422 listing each step; review shows "Fix this" links | ✅ API + web           |
| Publish without a confirmed phone        | Blocked; "Go to your profile"                        | ✅ API + web + browser |
| Double-click Publish                     | Same address; no error                               | ✅ API                 |
| Same title published twice               | Different addresses                                  | ✅ API                 |
| Edit after publishing                    | 409 "Editing a live fundraiser comes soon"           | ✅ API                 |
| Goal with decimals or below K100         | Field error                                          | ✅ API + shared        |
| Funeral without a goal                   | Allowed                                              | ✅ API + shared        |
| Draft address guessed by a visitor       | Public endpoint only serves published                | ✅ API                 |

## 8. Testing

- **Shared:** money (integer maths, parsing kwacha, formatting), campaign schemas, `publishProblems`, and the "no phone or email in the public shape" guard.
- **API:** `test/campaigns.e2e-spec.ts` (14 tests; real Postgres + Redis): drafts, autosave, validation, ownership, publishing rules, slugs, public view without personal data. `slugs.spec.ts`.
- **Web:** each wizard step (create, validation, kwacha → ngwee, funeral rules, publish gating, publish → live page), the public page, `resumeStep`.
- **Browser (Chromium):** full journey (sign up → wizard → blocked until phone confirmed → confirm → publish → live page → Your fundraisers), strangers get 404 on drafts, link-preview tags in the HTML, no personal data in public HTML, no hydration warnings; screenshots at 390 px and 1440 px, light and dark.

## Changelog

| Date       | Change           |
| ---------- | ---------------- |
| 2026-11-23 | Slice 3b shipped |
