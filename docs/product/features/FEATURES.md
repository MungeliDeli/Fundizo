# Fundizo — Feature List

Source of truth for what to build. IDs are stable: reference them in branches, commits and PRs (e.g. `feat(D-06): MTN collection`). Full context is in [`SPEC.md`](../SPEC.md). This file is the **canonical** list; `FEATURES.csv` and the `.xlsx` are exports and must be kept in sync (see [docs/README.md](../../README.md)).

124 features. Priority: **Must** / Should / Could. Status: Not started / In progress / Done.

## Phase 0 · Foundation (9)

### Foundation

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | Monorepo | pnpm + Turborepo with api, web, admin and shared packages | Must | Team | Not started |
| F-02 | CI/CD pipeline | GitHub Actions: lint, test, build, deploy to staging and production (set up with Claude Code) | Must | Team | Not started |
| F-03 | AWS environments | Staging and production in AWS Cape Town: ECS Fargate, RDS PostgreSQL, Redis, S3, NAT gateway with fixed outbound IP | Must | Team | Not started |
| F-04 | Secrets and config | AWS Secrets Manager; no keys in code, git or the frontend | Must | Team | Not started |
| F-05 | Observability | Error tracking, logs, traces; alerts on payment success rate, callbacks and float | Must | Team | Not started |
| F-06 | Double-entry ledger | Permanent ledger entries; every balance is calculated from them, never edited | Must | Team | Not started |
| F-07 | MTN MoMo adapter (sandbox) | Collections and disbursements built and tested against MTN's free sandbox | Must | Team | Not started |
| F-08 | Airtel Money adapter (sandbox) | Collections and disbursements built and tested against Airtel's test environment | Must | Team | Not started |
| F-09 | Job queue and outbox | Workers for payment status checks, SMS, sweeps and reconciliation, with retries | Must | Team | Not started |

## Phase 1 · MVP: donation campaigns (77)

### Accounts

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| A-01 | Phone sign-up and login | OTP by SMS, read automatically on Android; no password or email needed | Must | Everyone | Not started |
| A-02 | Profile | Name, photo, district and language | Must | Everyone | Not started |
| A-03 | Sessions | Short-lived access tokens with refresh; log out of other devices | Must | Everyone | Not started |
| A-04 | ID verification | NRC or passport front and back plus a live selfie; unclear cases go to a review queue | Must | Organisers | Not started |
| A-05 | Wallet name match | The registered MTN/Airtel wallet name must match the verified ID | Must | Organisers | Not started |
| A-06 | Payout wallets | Add and verify an MTN or Airtel wallet; a change needs OTP and a 48-hour wait | Must | Organisers | Not started |
| A-07 | Account recovery | A new phone or SIM needs an ID re-check, to stop SIM-swap fraud | Must | Everyone | Not started |
| A-08 | Notification settings | Choose SMS, push or email; opt out per campaign | Should | Everyone | Not started |
| A-09 | Privacy controls | Download my data; delete my account (Data Protection Act) | Should | Everyone | Not started |
| A-10 | Staff accounts | Admin, moderator, finance and support roles; 2FA required | Must | Staff | Not started |

### Campaigns

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| C-01 | Creation wizard | 6 steps with a progress bar and autosave at every step | Must | Organisers | Not started |
| C-02 | Beneficiary choice | Raise for myself or for someone else (name, phone, relationship) | Must | Organisers | Not started |
| C-03 | Categories | Medical, Funeral, Education, Emergency, Community, Event, Other | Must | Organisers | Not started |
| C-04 | Story editor | Title plus guided prompts (who, what happened, what the money is for, by when) with live preview | Must | Organisers | Not started |
| C-05 | Photo upload | Cover photo plus up to 10; compressed on the phone; option to blur sensitive images | Must | Organisers | Not started |
| C-06 | Goal and end date | Goal in ZMW (keep what you raise), optional end date, goal can be raised later | Must | Organisers | Not started |
| C-07 | Preview and publish | Preview as donors and WhatsApp will see it; publishing makes it live at once | Must | Organisers | Not started |
| C-08 | Co-organisers | Up to 3 helpers who can share, post updates and thank donors, but not withdraw | Should | Organisers | Not started |
| C-09 | Funeral template | No goal needed; deceased's name, burial date and place; same-day verification path | Must | Organisers | Not started |
| C-10 | Campaign lifecycle | Pause, end and close; switch a medical campaign to a funeral campaign with donors told | Must | Organisers | Not started |
| C-11 | Browse and search | Find campaigns by category, district, verified status and trending | Should | Donors | Not started |

### Verification

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| V-01 | Unlock-withdrawals checklist | Checklist on the dashboard: ID, beneficiary confirms, evidence, payout wallet, each with status | Must | Organisers | Not started |
| V-02 | Beneficiary SMS confirmation | Beneficiary replies YES or NO by SMS; next-of-kin path when they can't respond | Must | Organisers | Not started |
| V-03 | Evidence upload | Documents per category (hospital letter, fee statement, burial permit, etc.) | Must | Organisers | Not started |
| V-04 | Automatic checks | Duplicate photos, NRC or phone reused across campaigns, banned content | Must | Staff | Not started |
| V-05 | Verified badge | Badge on the campaign page; tap to see exactly what was checked | Must | Donors | Not started |
| V-06 | Unverified timeout | After 30 days unverified: campaign paused and donors offered refunds | Must | Staff | Not started |
| V-07 | Re-verification | Triggered when the beneficiary, payout wallet or story changes | Should | Staff | Not started |

### Donations

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| D-01 | Guest donation | Donate with no account, just an MTN or Airtel number | Must | Donors | Not started |
| D-02 | Amount picker | K50, K100, K200, K500 or a custom amount, with a minimum | Must | Donors | Not started |
| D-03 | Optional tip | Suggested tip to the platform, easy to set to zero; the platform's only revenue | Must | Donors | Not started |
| D-04 | Cover the fees | Tick box showing the exact network fee; donor adds it on top | Should | Donors | Not started |
| D-05 | Network detection | MTN or Airtel logo appears from the number's prefix; number remembered on the device | Must | Donors | Not started |
| D-06 | MTN MoMo collection | USSD push payment prompt (sandbox first, live before launch) | Must | Donors | Not started |
| D-07 | Airtel Money collection | USSD push payment prompt (sandbox first, live before launch) | Must | Donors | Not started |
| D-08 | Waiting screen | "Check your phone" with live status, countdown and a resend option | Must | Donors | Not started |
| D-09 | Payment confirmation | Callback plus status polling; a "not yet confirmed" state; no double charges | Must | Donors | Not started |
| D-10 | Anonymous giving and message | Give anonymously or show a name, with an optional message of support | Must | Donors | Not started |
| D-11 | SMS receipt | Receipt by SMS after every successful donation | Must | Donors | Not started |
| D-12 | Refunds | Staff refund one donation or every donor of a campaign | Must | Staff | Not started |

### Payouts

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| P-01 | Available balance | Raised minus network fees minus earlier withdrawals, with pending amounts shown | Must | Organisers | Not started |
| P-02 | Withdrawal request | Choose amount; confirm destination showing the wallet's registered name; confirm by OTP | Must | Organisers | Not started |
| P-03 | Payout approval (staff) | Finance approves each withdrawal at first; automatic for low-risk ones later | Must | Staff | Not started |
| P-04 | MTN/Airtel disbursement | Payout sent from the matching network's disbursement wallet | Must | Organisers | Not started |
| P-05 | Payout tracking | Requested, Approved, Sent, Received, with times | Must | Organisers | Not started |
| P-06 | Public money trail | Every withdrawal shown on the campaign page | Must | Donors | Not started |
| P-07 | Proof-of-use prompt | After a withdrawal, the organiser is asked for a receipt photo | Should | Organisers | Not started |
| P-08 | Float management | Float per network, daily sweeps to bank, top-ups, low-float alerts | Must | Staff | Not started |
| P-09 | Daily reconciliation | Match MTN and Airtel statements to the ledger; payouts pause on any unexplained gap | Must | Staff | Not started |

### Outreach and sharing

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| O-01 | Share sheet | One tap to WhatsApp chat, WhatsApp Status, Facebook, TikTok, or copy link | Must | Everyone | Not started |
| O-02 | Link previews | Server-rendered preview with photo, title and amount raised | Must | Everyone | Not started |
| O-03 | Pre-written share messages | Editable message per category, ready to send with the link | Must | Organisers | Not started |
| O-04 | Donor reshare | After donating: "Share to help reach the goal" | Must | Donors | Not started |
| O-05 | Share image for Status and stories | Auto-made image with cover photo and progress bar, sized for WhatsApp Status and Facebook stories | Should | Everyone | Not started |
| O-06 | Printable QR poster | PDF poster with a QR code for church notice boards and funeral houses | Should | Organisers | Not started |
| O-07 | Tracked share links | Each sharer gets their own link; the dashboard shows which channel and person brought donations | Should | Organisers | Not started |
| O-08 | Share nudges | Prompts at the right moments: after publish, when verified, at 50% and 80%, after 3 quiet days | Should | Organisers | Not started |

### Updates and feed

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| U-01 | Campaign updates | Organiser posts text and photos (e.g. "Surgery booked for Friday") | Must | Organisers | Not started |
| U-02 | Update notifications | Donors and followers notified of each update by SMS (opt-in), push or email | Must | Donors | Not started |
| U-03 | Thank-you messages | Thank donors one by one or all at once, by SMS or WhatsApp template | Must | Organisers | Not started |
| U-04 | Donor wall | Recent donors (or Anonymous) with amounts and messages | Must | Donors | Not started |
| U-05 | Words of support | Donors leave comments; moderated; organiser can hide them | Should | Donors | Not started |
| U-06 | Follow a campaign | Get updates without donating | Should | Everyone | Not started |

### Notifications

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| N-01 | SMS gateway | Zambian SMS provider behind an adapter: OTP, receipts, confirmations, updates | Must | Team | Not started |
| N-02 | Templates and translations | All messages from central templates, ready for local languages | Must | Team | Not started |
| N-03 | Push notifications | Web push for the PWA; app push later | Should | Everyone | Not started |
| N-04 | Email | Optional receipts and updates by email | Could | Everyone | Not started |

### Organiser dashboard

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| B-01 | Campaign dashboard | Total raised, today's donations, donor count, shares, verification checklist | Must | Organisers | Not started |
| B-02 | Donor list | Who gave, how much, when; CSV export later | Must | Organisers | Not started |

### Admin and trust

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| T-01 | Report a campaign | Report link on every campaign page with reasons | Must | Everyone | Not started |
| T-02 | Moderation queue | Review reported and flagged campaigns: approve, request changes, pause, refund all, ban | Must | Staff | Not started |
| T-03 | Verification review queue | Review IDs, evidence and beneficiary confirmations; 24-hour target, 4 hours for funerals | Must | Staff | Not started |
| T-04 | Payout approval queue | Approve or hold withdrawals with risk signals shown | Must | Staff | Not started |
| T-05 | Risk flags | New-account limits, unusual donation or withdrawal patterns, duplicates | Should | Staff | Not started |
| T-06 | Audit log | Every staff and money action: who, what, when and why | Must | Staff | Not started |
| T-07 | Support lookup | Find a donation by phone number or reference and see its status | Must | Staff | Not started |
| T-08 | Finance reports | Reconciliation results, tips revenue, network fees, float levels | Must | Staff | Not started |

## Phase 2 · Groups and local giving (24)

### Accounts

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| A-11 | Local languages | Bemba, Nyanja and Tonga for key screens and SMS | Should | Everyone | Not started |

### Groups and organisations

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| G-01 | Create a group | Name, type and photo; invite members by phone with an SMS or WhatsApp link | Must | Groups | Not started |
| G-02 | Group roles | Owner, treasurer and member, each with set permissions | Must | Groups | Not started |
| G-03 | Withdrawal approval rule | 1 or 2 approvals per withdrawal; the requester can never approve their own | Must | Groups | Not started |
| G-04 | Member-drafted campaigns | Members draft campaigns; an owner or treasurer publishes them | Should | Groups | Not started |
| G-05 | Organisation upgrade | Upload registration certificate and authorisation letter to get the organisation badge | Must | Organisations | Not started |
| G-06 | Organisation wallet | Payouts to an MTN/Airtel wallet in the organisation's registered name | Should | Organisations | Not started |
| G-07 | Group and organisation page | Public page with campaigns, member count and verification status; can be followed | Should | Groups | Not started |

### Campaigns

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| C-12 | Event contributions | Wedding, kitchen party and chilanga mulilo contribution lists with named gifts | Must | Organisers | Not started |
| C-13 | Pledges | Pledge now, get reminders, pay later with a one-tap link (inside events and church drives) | Should | Donors | Not started |
| C-14 | Group-owned campaigns | Campaigns owned and run by a group or organisation | Must | Groups | Not started |

### Verification

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| V-08 | Referee endorsements | A pastor, headteacher or clinic officer confirms the need through an SMS link | Should | Organisers | Not started |

### Donations

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| D-13 | Zamtel Kwacha | Third mobile money network | Should | Donors | Not started |
| D-14 | USSD donate menu | Donate and check totals from a short code, no data needed | Should | Donors | Not started |

### Payouts

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| P-10 | Group second approval | A second treasurer approves with one tap from an SMS or push notification | Must | Groups | Not started |

### Outreach and sharing

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| O-09 | Invite contacts | Pick phone contacts and send a WhatsApp or SMS invite from the organiser's own phone | Should | Organisers | Not started |
| O-10 | Messages in local languages | Share messages in Bemba, Nyanja and Tonga | Should | Organisers | Not started |

### Updates and feed

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| U-07 | Home feed | Updates from campaigns you gave to or follow, and from groups and organisations you follow | Should | Everyone | Not started |
| U-08 | Discover feed | Verified campaigns near you, trending, nearly funded, by category | Should | Donors | Not started |
| U-09 | Milestone posts | Automatic posts when a campaign is verified, reaches 50% or 100%, or makes a withdrawal | Could | Everyone | Not started |
| U-10 | Reactions | React to updates (heart, praying hands) | Could | Everyone | Not started |

### Notifications

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| N-05 | WhatsApp Business messages | Receipts and updates sent as WhatsApp template messages | Could | Everyone | Not started |

### AI

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| AI-01 | Story helper | Turns a few answers or a voice note into a draft story and title; organiser edits it | Should | Organisers | Not started |
| AI-02 | Translation | Stories and updates in English, Bemba, Nyanja and Tonga | Should | Everyone | Not started |

## Phase 3 · Scale and trust (9)

### Campaigns

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| C-15 | Milestones option | Money released per milestone after proof is reviewed | Should | Organisers | Not started |
| C-16 | Matching funds | A sponsor matches donations up to a cap within a time window | Should | Organisations | Not started |
| C-17 | Peer-to-peer team pages | Supporters create their own pages under one organisation's cause | Could | Organisations | Not started |
| C-18 | Simple recurring support | Monthly reminder with a one-tap payment link | Could | Donors | Not started |
| C-19 | Itemised giving | Donors pay for listed items (e.g. a bag of cement); organiser posts proof of purchase | Could | Organisers | Not started |

### Donations

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| D-15 | Card payments (diaspora) | Card payments with amounts shown in GBP or USD | Should | Donors | Not started |

### Payouts

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| P-11 | Bank payouts | Withdraw to a bank account | Could | Organisers | Not started |

### Outreach and sharing

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| O-11 | Website donate widget | Donate button organisations can embed on their own website | Could | Organisations | Not started |

### Organiser dashboard

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| B-03 | Organisation analytics | Totals across campaigns, by channel and by period | Could | Organisations | Not started |

## Phase 4 · AI features (5)

### AI

| ID | Feature | What it does | Priority | Users | Status |
| --- | --- | --- | --- | --- | --- |
| AI-03 | Moderation assist | Flags banned content, graphic images and copied stories for human review | Should | Staff | Not started |
| AI-04 | Document checks | Reads NRCs and invoices; checks names and amounts match; a human approves | Should | Staff | Not started |
| AI-05 | Fraud scoring | Risk score per campaign and payout; high scores go to manual review | Should | Staff | Not started |
| AI-06 | Recommendations | Suggests campaigns by district and interest; semantic search | Could | Donors | Not started |
| AI-07 | Organisation assistant | Answers questions about an organisation's own fundraising data | Could | Organisations | Not started |
