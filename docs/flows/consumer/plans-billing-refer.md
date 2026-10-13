# Flow: Plans, Billing & Refer-a-Friend

> The monetisation and growth surface: pay-per-use products (listing pass, contact pack), the rent
> agreement fee, checkout, the per-user billing view, and a two-track referral program with
> non-monetary rewards. Nothing auto-renews and every price includes GST (Q16b).
> **Status:** re-synced to Q16b (pay-per-use MVP) - **Primary role(s):** owner + seeker (buyer/tenant)

---

## 1. Purpose & user problem
- **Persona:** an owner who wants a second property live at once; a seeker who has used the free
  owner contacts; any user who wants to earn rewards by inviting friends.
- **Job-to-be-done:** "Use Draazy free, pay a small one-off amount only when I need more, see my
  billing, and get rewarded for bringing friends who list or search."
- **Why it matters:** this is how zero-brokerage is funded at MVP (rent agreements, listing passes,
  contact packs) and how the marketplace grows virally.

## 2. Entry points
- **Routes:** `/plans` (public), `/checkout?plan=contact-pack|listing-pass[&property=<id>]`
  (signed-in; redirects to `/signin?next=...`), `/refer` (signed-in), and the Dashboard "Plan &
  Billing" tab (`#billing`).
- **Tiles / triggers:** BillingPanel "Change plan ->" (`/plans`); My Listings "Get a pass" on a
  paused listing; `ContactsExhaustedModal` "Get 15 more"; Refer page share buttons; the Plans
  "Create rent agreement" CTA (`/services/rent-agreement`); agreement renewal strips in the dashboard.
- **Source components:** `src/pages/consumer/Plans.jsx`, `src/pages/consumer/Checkout.jsx`,
  `src/pages/consumer/Refer.jsx`, `src/pages/consumer/dashboard/BillingPanel.jsx`,
  `src/components/dashboard/AgreementPerks.jsx`, `src/context/PlanContext.jsx`.
- **Data/seed:** the `plans` seed in `R__DML_seed_reference_data.sql` and V107, referral admin rows
  from `GET /referrals`, `src/pages/consumer/dashboard/constants.js` (`BILLING_HISTORY`).

## 3. Actors & roles
- **Owner products** (listing pass, rent agreement) and **seeker products** (contact pack) are shown
  side by side; the mobile view toggles persona (defaults to the user's `role`).
- **Checkout** requires sign-in. **Referral rewards** are role-tracked (owner track vs seeker track).
- **Fraud review** of referrals is an ops/admin responsibility (see
  [`../ops/referrals-fraud.md`](../ops/referrals-fraud.md), planned) - the consumer app only records
  invites/joins/listings and never self-awards across devices.

## 4. Entities touched
Links go to [`../../system/data-model.md`](../../system/data-model.md).
- `plans` (`kind`, `term_days`, `active`) - read.
- `subscriptions` (`property_id` for a listing pass) - created by `POST /me/subscription`,
  activated by the Cashfree webhook, expired by `SubscriptionSweeper`.
- `settings.fees` - read via `GET /pricing`.
- `contact_requests`, `properties` - read to derive entitlements; `rent_agreements` - read and
  stamped by the renewal sweep.
- `referrals` (`GET /referrals`) - read.
- `BILLING_HISTORY` (static seed constant) - read for the payment-history table.

## 5. Business rules & logic  *(the meat)*

### Price list (`Plans.jsx`)
The page reads the active catalogue (`GET /plans`, also in `GET /bootstrap`); each row carries
`kind` and `termDays`. Retired subscription rows (`kind = plan`, `active = false`) are honoured until
they lapse but never sold.
- **Listing pass** (`b1…005`, `kind = listing-pass`, Rs 999, 60 days): one extra *live* rent/sell
  listing, bound to one property (`subscriptions.property_id`). It ends early when that listing is
  rented, sold or archived. Re-listing later is free if it fits the free tier.
- **Contact pack** (`b1…006`, `kind = contact-pack`, Rs 199, 15 contacts, 30 days from payment).
  Packs stack.
- **Rent agreement**: Rs 499 + government charges (stamp duty, registration), first or renewal.
- Free: 1 live listing, unlimited flatmate posts, 15 owner contacts in the first 30 days, referral
  rewards, `featuredDays` (7) of Featured after ownership verification.

### Platform fees (`settings.fees`)
- Keys: `listingPass`, `contactPack`, `rentAgreementPlatform`, `gstPercent` (0: prices include GST),
  `freeContactLimit`, `featuredDays`, and the referral numbers `referralContactBonus`,
  `referralSeekerBonusContacts`, `referralOwnerFeaturedDays`, `referralOwnerRewardAgreements`,
  `referralQualifyPerMonth`, `referralQualifyPerYear`, `referralHoldDays`, `referralClawbackDays`,
  `referralVelocityPerDay`, `referralSignupWindowHours`, `referralSignalRetentionDays`,
  `referralNewReferrerDays`. Admin PATCH validates each against fixed bounds. `GET /pricing`
  publishes the prices and a `referral` block (not velocity, retention or new-referrer days);
  editable in Admin → Settings → Fees. The charged amount is always the plan row's `price`.

### Entitlements / gating
- **Listing tier (soft gate).** 1 free live listing (live = approved or flagged), plus one per
  active pass. Posting and drafting are never refused. When moderation approves
  a listing that would exceed the tier it is stored **paused**; My Listings offers "Get a pass" →
  `/checkout?plan=listing-pass&property=<id>`, and a paid pass resumes it. An owner resume over the
  tier is a **422 `listing_quota_exhausted`**; pausing or archiving another listing frees the slot.
  `GET /me/entitlements` → `listings {allowance, used, passes[{propertyId, expiresAt}]}`
  (`used` = live listings no pass covers). Flatmate posts never count; the 3-active-post cap on
  non-owner hosts stays as an anti-broker guard.
- **Owner-contact quota (derived, D31b + Q16b).** A "contact" is the right to open one
  `contact_requests` row. `ContactAllocator` replays the caller's contacts, oldest first, against
  buckets: **free** (`settings.fees.freeContactLimit` = 15 plus the friend bonus, usable until 30 days
  after the first contact, once per account), each paid **pack** (15, valid 30 days from payment) and
  **referral**
  contacts (never expire). Each contact spends the valid bucket that expires soonest; `remaining` is
  what is left in buckets valid now. Nothing is stored, so a repeat press on the same listing and a
  refused press cost nothing. A legacy unlimited plan stays unlimited until it lapses. Read from
  `GET /me/entitlements` → `contacts {unlimited, used, allowance, remaining, referralBonus, friendBonus,
  freeWindowEndsAt, packExpiresAt}`; the refusal is a **422 `contact_quota_exhausted`** from
  `POST /contacts/request`, and `ContactsExhaustedModal` offers the pack.

### Checkout (`Checkout.jsx`)
- `/checkout?plan=contact-pack` or `/checkout?plan=listing-pass&property=<id>`; anything else →
  `/plans`. Requires sign-in (`/signin?next=…`). A pass for a listing that is not the caller's, is
  archived or is already covered is refused (409/422) and the page sends the owner back to My Listings.
- `POST /me/subscription {planId, propertyId?, paymentMethod}` with an Idempotency-Key unique to the
  checkout screen: a double tap returns the same order, a second pack is a new purchase. A pending
  order opens Cashfree; only the signed webhook activates it. One open unpaid order per user (409).
- The page shows the flat price (GST included) and, once paid, the expiry date. Nothing auto-renews.

### The Cashfree webhook signature (`WebhookSignature`)

HMAC-SHA256 is the only thing between "this order was paid" and "anyone on the internet can grant
themselves a paid plan".

- **Signed material is `x-webhook-timestamp + rawBody`,** in that order, no separator. The timestamp
  is inside the signature so a captured payload cannot be re-signed under a different time, and the
  body must be the *raw* bytes: parsing and re-serialising JSON reorders keys and normalises
  whitespace, which changes the digest and would make every genuine callback look forged.
- **A ±5 minute freshness window.** The signature proves authenticity, not freshness; without a
  window a payload captured once is replayable forever.
- **Constant-time comparison,** so a valid signature cannot be recovered byte by byte from timing.
- **A blank secret is rejected at construction.** An empty HMAC key still produces a perfectly valid,
  publicly-computable signature, so `CASHFREE_WEBHOOK_SECRET=""` would turn verification into a
  formality rather than failing loudly.
- **The committed default refuses to boot in two situations.** Either the live gateway is switched on
  under any profile — real money on a published key is the same mistake whether or not the profile is
  called prod — or any profile other than `local` is active, gateway flag or not. The second arm is
  an allowlist rather than a check for `prod`, because a container named `staging`, `preview` or
  nothing at all is the ordinary state of a first deploy. The webhook route is `permitAll` and gets
  its own rate-limit budget rather than an exemption — 50× the write allowance, sized for a provider
  replaying a backlog, since it can neither share a bucket with users nor be exempt while anonymous
  (the enabled flag gates only the *outbound* client) — so anyone holding
  this repository could sign a `PAYMENT_SUCCESS` for an order id the API had just handed them. Both
  arms still apply under `dev`: pointing at the Cashfree sandbox means receiving callbacks from
  outside the machine. The reason is returned as a string, not a boolean, so the boot failure names
  which trigger fired.
- **A failed verification answers 200 and drops the payload**, telling a prober nothing — but it no
  longer tells *us* nothing either. The refusal is a named reason, not a boolean: `MISSING_HEADER`
  (not a Cashfree call at all), `MALFORMED` (a non-numeric timestamp or a non-Base64 signature),
  `MISMATCH` (well-formed, wrong key) and `STALE` (correctly signed, outside the five-minute
  window). The undifferentiated "not verified" this replaces is what made the timestamp-unit bug
  expensive: it named the secret as the suspect while the secret was correct.
  Freshness is checked *after* the HMAC, so `STALE` means "we signed this" and is the one refusal
  logged at `error` — an anonymous caller cannot manufacture it, and a genuine callback refused on
  the clock is money that will not be reconciled. `MISMATCH` is `warn` precisely because anyone can
  reach it. A crypto failure is no longer in this list at all: an unavailable HMAC-SHA256 is a fault
  in this JVM, not a bad callback, so it throws rather than posing as the sender's mistake.
- **The address Cashfree posts to is sent per order** as `order_meta.notify_url`, from
  `CASHFREE_NOTIFY_URL`, rather than relying on the single endpoint the dashboard holds. It is
  validated at boot as an absolute `https` URL — blank is legal and means "use the dashboard
  endpoint" — so a cleartext or relative address is a startup failure instead of a silent
  non-delivery.

`application-prod.properties` separately binds a bare `${CASHFREE_WEBHOOK_SECRET}`, so a prod boot
with the variable unset fails in the binder first — but that only fires for a deploy naming `prod`
and reading that file; the constructor check is what states the rule.

### Billing view (`BillingPanel.jsx`)
- Current product from `usePlan()`: a pass or pack shows its term; otherwise the free tier line
  ("1 live listing free · Rs 999 pass for each extra" / "15 free owner contacts in your first 30
  days"). Payment history is still the static `BILLING_HISTORY` seed. "Change plan ->" links to `/plans`.

### Refunds, contact returns and credit notes
- **Contact returns (no money moves).** The contact quota counts only requests that revealed or may still
  reveal the number: approved rows always, pending ones while they are younger than `fees.contactReplyDays`
  (default 7), whatever happens to the listing meanwhile. Declined, expired and stale-pending requests are
  returned. Asking about a closed listing (paused, rented, sold) is `409 listing_not_live`; an archived, unapproved or
  suspended-owner listing is `404`. An owner approving while theirs is not live gets the same `409 listing_not_live`
  (decline is always allowed). A daily sweep (`ContactReturnSweep`) marks overdue pending rows `expired` and sends
  the seeker `contact.returned`; a decline sends the same. The rows stay, so the same listing cannot be
  re-asked to farm returns, and renewing a lapsed request re-checks the allowance. When
  `fees.contactPendingMax` (default 10) requests are open, `POST /contacts/request` is `422 contact_pending_limit`.
- **`GET /me/payments`** lists the caller's paid orders, newest first: `{id, kind: listing_pass|contact_pack|
  rent_agreement|ra_amendment, label, amount, paidAt, invoiceNo, status: paid|refund_pending|refunded|
  refund_rejected|disputed, creditNoteNo?, propertyId?, serviceRequestId?, refund{eligible, reason, from, until,
  amount}}`. `refund` is computed for passes and packs only. Reasons: `pack_unused`, `pass_no_enquiries`,
  `not_eligible_used`, `window_closed`, `window_not_open`, `guarantee_used_recently`, `already_requested`,
  `listing_paused`. `invoiceNo` is the order's GST tax invoice number, or null when none was issued. `X-Device-Id` (at most 64 chars) is salt-hashed like the referral code.
- **Customer refund request.** `POST /me/payments/{id}/refund {reason?}` with an `Idempotency-Key`. Eligibility:
  - *Pack:* within `fees.packRefundDays` (default 7, 0 = off) of payment and no contact allocated from it.
  - *Pass guarantee:* its listing got at most `fees.passGuaranteeMaxEnquiries` (default 0) contact requests in the
    first `fees.passGuaranteeDays` (default 7, 0 = off) days of the pass; claimable from the end of that window
    until 7 days after; once per `fees.passGuaranteeEveryMonths` (default 12) per owner, linking accounts by user
    id, device-id hash and payment-instrument hash. Enquiries count from the pass start up to the claim (and again
    at approval), not only inside the window, and the listing must have been publicly live for the whole window:
    a pause in it (recorded by a trigger in `property_live_gaps`) gives `listing_paused`.
  - Not eligible: `422 refund_not_eligible` with a top-level `reason`.
  - Eligible: a `pending_review` request is created and the order is frozen. A frozen pack's contacts cannot be
    used; a frozen pass stops covering its listing (it falls back to paused under the soft gate). Staff holding the
    `refunds` back-office function (and admins) get `refund.requested`.
- **Staff decision.** Every customer refund needs it. Approve re-checks the facts as of the request, then
  `markRefundDue(amount)`; the existing sweep, gateway and webhook path pays it and the entitlement is revoked for
  good. Reject needs a `reason` and restores the entitlement, with the term pushed out by the time the order
  was frozen (it expires instead if it would still have ended, and a pass's listing goes live again only if the
  listing quota allows). Both are `409` while a gateway dispute is open on the order. Both notify the customer with `refund.decided`
  and are audited `refund.*`. The request row is locked, so concurrent decisions leave one (the other gets 409).
- **Automatic system refunds stay automatic** (failed, late or mismatched payment; a pass for a closed listing).
  They also notify `refunds` holders with `refund.auto` and show on the desk as `auto`.
- **GST credit note** `CN-FY2627-000001` (FY April-March, IST, one sequence per FY) is issued when a refund is
  confirmed successful by the gateway for an invoiced order (an automatic refund of a payment that never activated gets none): subscription refunds, rent-agreement refunds, automatic refunds. Amounts are
  GST-inclusive and split with `gstPercent` (18% when unset); a rent-agreement note taxes only the platform fee,
  the pass-through part is untaxed. A note never credits more taxable value than its invoice carried, less what earlier
  notes on that invoice already credited, and cites the invoice number.
- **GST tax invoice** `INV-FY2627-000001` (same FY and per-FY sequence pattern) is issued once when a gateway
  payment succeeds: listing passes, contact packs, rent-agreement checkouts and amendment top-ups. A replayed
  webhook issues nothing new. Only the platform fee carries GST on a rent agreement; amendment top-ups carry none.
  A payment that is refunded automatically without ever activating the order (failed, late) gets no invoice.
  Orders paid before invoicing were numbered in `paid_at` order by the migration. No PDF is generated.
- **Disputes.** The signed Cashfree webhook also takes `DISPUTE_CREATED`, `DISPUTE_UPDATED`, `DISPUTE_CLOSED`
  (unknown types are tolerated) into `payment_disputes`. A dispute freezes only its own order and notifies `refunds`
  holders with `refund.dispute`; closing it won restores the entitlement (term extended as above), lost or accepted
  revokes it from whatever status the order was in. A pack frozen by a dispute or review keeps the contacts it
  already served but lends no more. The account
  is never suspended. `/me/payments` shows `disputed`.
- **Settings.** `fees`: `contactReplyDays` 1..30, `contactPendingMax` 1..100, `packRefundDays` 0..30,
  `passGuaranteeDays` 0..30, `passGuaranteeMaxEnquiries` 0..50, `passGuaranteeEveryMonths` 1..36; `legal.grievanceOfficer`
  `{name <= 80, email <= 120}`. `GET /bootstrap` carries `pricing.refunds` and `legal`.

### Rent-agreement retention (`AgreementPerks.jsx`, `RentAgreementRenewalSweeper`)
- A daily 09:00 IST sweep notifies the owner (once per agreement) and each tenant whose mobile
  matches, 60 days before a registered/active agreement ends (`rent_agreements.renewal_reminded_at`
  makes it once). `GET /me/rent-agreements` rows carry `serviceRequestId` and `endDate`.
- Agreement rows ending within 60 days (or up to 30 days past) show "Renew for Rs 499" →
  `/services/rent-agreement?listing=<pid>&renew=<agreementId>`, which loads
  `GET /me/rent-agreements/{id}/renewal` (owner or the tenant whose verified mobile is on the agreement;
  404 otherwise) and prefills owner, tenants, rent, deposit and months, starting the day after the old end.
  Owners also get "Tenant moving out? List it again" → `/dashboard?relist=<pid>&from=<date>#properties`;
  `RelistModal` picks the available date (default the day after the end) and calls
  `POST /me/deals/{pid}/reopen {availableOn}`, which ends the tenancy the day before that date.
- A listing pass checkout still unpaid when its listing is archived, rented or sold is cancelled; a payment
  that lands anyway grants nothing and is refunded through the gateway (retried by the hourly sweep).
- Registered/active rows show "You saved Rs <rent> in brokerage" with a Share button.

### Referral program (`Refer.jsx` + `store/referrals.js`)

The server mints each user's permanent code in `referral_codes` (format `PUNE-AB12`);
`POST /referrals/redeem` resolves only that. `Refer.jsx` reads everything from `GET /me/referrals`.

- **Summary:** `GET /me/referrals` → `{ code, invited, converted, held, earned: { owner: { referrals,
  agreements }, seeker: { referrals, contacts } }, friendReward: { redeemed, status, track, contacts,
  featuredDays } }`. Every reward number on the page comes from `GET /pricing` → `referral`
  (admin settings under `fees`); nothing is hardcoded in the client.
- **Link:** `referralLink(code)` = `<origin>/signup?ref=<code>` (drives `?ref` capture on signup).
- **Redemption:** `POST /referrals/redeem` (with an optional `X-Device-Id` header, opaque, at most 64
  characters, stored only as a salted hash). Allowed only within `referralSignupWindowHours` of
  account creation, while the account has no listing and no contact request, while the
  `referralRewards` flag is on, and not from the referrer's own device. Every refusal is the same
  `409`, so the response never says which rule failed.
- **Tracks** (the first qualifying event decides and is stored on the row):
  - **Owner:** the friend's listing passes ownership verification. The referrer earns
    `referralOwnerRewardAgreements` free rent agreement(s) (`agreements.free` on
    `GET /me/entitlements`); the listing is Featured for `referralOwnerFeaturedDays`.
  - **Seeker:** an owner accepts the friend's first contact request. The referrer earns
    `referralContactBonus` owner contacts (`contacts.referralBonus`, never expiring); the friend's
    one-time free bucket gains `referralSeekerBonusContacts` (`contacts.friendBonus`) from redemption,
    for as long as the referral is not rejected or clawed back.
  - There is no listing-slot reward.
- **Automatic decision at qualification:** signals are same IP /64, same User-Agent, same device,
  velocity (`referralVelocityPerDay`), a referrer account under `referralNewReferrerDays` old, and a
  redeem with no usable `X-Device-Id`. Seeker acceptances count only on an approved live listing; a
  referrer approving their own referee's contact is rejected `self_dealing`, and one owner qualifying a
  second referee of the same referrer within 30 days is high.
  Two or more signals (or velocity) = high, rejected with a notification to the referrer; one = medium,
  `held` for `referralHoldDays` and re-checked by an hourly sweep; none = low, granted at once. Past
  `referralQualifyPerMonth` (calendar month, IST) or `referralQualifyPerYear` = rejected
  `cap_reached`. Each decision is audited as `referral.auto.*` with actor `system`.
- **Automatic clawback** within `referralClawbackDays` of the grant when the referee is suspended or
  the qualifying listing is taken down or its ownership verification revoked (for a seeker referral only
  a moderation reject/flag of the contacted listing counts, not its archive or revoke); the referrer is
  notified. A held referral meeting the same events is rejected instead. Staff overrides are never
  undone by the hourly sweep.
- **Kill switch:** the `referralRewards` flag off refuses redeem and stops new grants.
- **Digests:** the referrer's IP/UA/device digests refresh on every `GET /me/referrals`; all digests
  are cleared after `referralSignalRetentionDays`.

### Referral fraud signals and desk
Each referral carries `risk` (low/medium/high), `channel`, `track`, `reward`, `rewardAmount`,
`identityVerified`, `identityUnique`, `sameDevice`, `sameIp`, `velocityHigh`, `activated`, `holdUntil`,
`autoReason` and `status` (`pending`, `qualified`, `held`, `rewarded`, `rejected`, `clawed-back`),
plus `handledBy`/`handledAt` (`system` for automatic decisions). The desk at `GET /referrals` is a
review and override surface, not a work queue: referrals are not in staff "My work". The identity
check is a **reward-payout uniqueness** guard (`identity_hash`) — **not** a browse/post/contact gate,
which stay at L1 mobile (ADR-019).

## 6. Maker-checker / approval
- **Plans/checkout:** no maker-checker (self-serve purchase).
- **Referral rewards:** decided automatically at qualification (risk band, hold, caps) and taken
  back automatically on clawback events; staff approve/reject/clawback are overrides. See
  [`../ops/referrals-fraud.md`](../ops/referrals-fraud.md) and
  [`../../system/cross-cutting.md`](../../system/cross-cutting.md) section 2.

## 7. State machine
```
Pass / pack:    pending (Cashfree order) --signed webhook--> active --term ends--> expired
                listing pass also ends when its listing is rented, sold or archived
Over-tier listing: pending --approve--> paused --pass paid / slot freed--> approved
Referral:       (per RF row) pending -> qualified (granting) -> rewarded
                            pending -> held --hold elapses--> qualified | rejected
                            pending -> rejected (high risk / cap_reached)
                            qualified | rewarded -> clawed-back   (inside the clawback window)
```

## 8. Edge cases, validation & error states
- **Unknown/missing `?plan=`** -> redirect to `/plans`. **Signed-out checkout** -> redirect to signin
  with `next`.
- **Second pass for the same listing** -> 409; packs are deliberately re-purchasable and stack.
- **Over the free tier** -> the listing is saved and approved into `paused`; resuming it without a
  pass or a free slot is `422 listing_quota_exhausted`.
- **Featured** is never sold: `featuredDays` (7) from ownership verification, re-granted on
  re-verification; the friend's qualifying listing gets `referralOwnerFeaturedDays` (14).
- **Referral vanity guard:** nothing the page does moves the invite count — it is the server's count
  of redeemed codes, so neither a copy nor a completed share nor a cancelled OS share can inflate it.
- **Cross-device attribution:** closed. Referrer counters and every earned balance are derived from
  the server's referral rows, so a friend signing up on another device counts and clearing site data
  loses nothing.
- **Fee source fallback:** if `GET /pricing` is unreachable, the frontend falls back to its bundled
  defaults; the charge is always the server's plan row.


## Appendix: entitlement and plan-model rationale (moved from source Javadoc)

### Entitlements are derived, not stored
`EntitlementService` computes every allowance on each call from rows that already exist for other
reasons: the caller's subscription and the `granting` referrals count. There is no allowance
column, no balance, no grant ledger. A stored balance has to be written by every code path that
could change it and is wrong forever the first time one of them forgets; a derived balance is
right by construction, and a clawed-back referral withdraws its contacts the moment the fraud
desk records the decision — with no compensating write to remember.

This replaced a quota that lived in `localStorage` under a key derived from the caller's own
mobile, computed by a module whose header said in as many words that it was not real security.
The referral bonus that topped it up was computed the same way, from counters the client
incremented for itself, which meant the referral scheme paid out a reward the platform never
actually granted.

`EntitlementService` implements `ContactAllowanceLookup` (consumed by `leads`) and consumes
`ContactUsageLookup` from `leads`. Neither feature imports the other; both import the kernel.

### The reward "ledger" is the referrals table itself
Approve and clawback are described as crediting and debiting a ledger; that ledger is
`sum(reward_amount) group by status`. A separate double-entry table was considered and rejected:
nothing external moves this rail, the amount is frozen on the row at redemption, and every
mutation carries who, when and why. `finance.ledger.Transaction` is the **user's own** rent-and-
expense book and would be actively wrong as a home for platform-side credits.

### Free tier is a settings value, not a plan row
A caller with no subscription has nothing in `plans` to read, so `SubscriptionService#entitlingPlan`
returning empty is the normal case rather than an error. The defaults in `EntitlementService`
(`DEFAULT_FREE_LISTING_LIMIT = 1`) are what "no purchase" is worth. Seeding a synthetic Owner
Free row into every entitlement check was the alternative and was rejected: it would put the free
tier on the public pricing list as a thing to subscribe to.

`DEFAULT_FREE_LISTING_LIMIT` mirrors `listing_limit` on the seeded Owner Free plan but is
duplicated as a constant because the free tier is defined by the *absence* of a subscription.
It is also what a plan with a `null` `listing_limit` is worth: `Optional.map` over a null column
collapses to empty and lands on this same default, so a null limit grants the free floor rather
than lifting the ceiling — the safe direction, and the one V24 writes down.

### Referral bonuses
Each granting owner-track referral earns `referralOwnerRewardAgreements` free rent agreements;
each granting seeker-track (or legacy untracked) referral earns `referralContactBonus` contacts.
There is no listing-slot reward. The friend's side is `referralSeekerBonusContacts` extra free
contacts while the redeemed code stands, and the qualifying listing's Featured window is
`referralOwnerFeaturedDays` instead of `featuredDays`.

`forUser` computes both halves together so the contact and listing sides come from one plan read
and one referral count. Splitting into two endpoints would run the same two queries twice and
could straddle a change between them. The unlimited-contacts branch still reports the bonus: a
subscriber who also referred people has earned those contacts, and hiding the number while the
plan makes it moot would make the Refer page look broken to exactly the users who used it most.
It reappears the day they downgrade.

`listingAllowance` / `contactAllowance` are narrower than `forUser` because each gate is about to
count the caller's own usage anyway and does not need the other halves. `contactAllowance`
deliberately does not call `forUser` and read one field: doing so would make every contact
request pay for a count of the caller's own contact requests that the gate does not use.

### `converted` counts what pays, not what a human blessed (D31b)
`ReferralSummaryDto.converted` used to mean `rewarded` alone, which was correct while a checker
was the only thing releasing a reward. Now that `QUALIFIED` grants on its own, a referrer whose
friend has verified a listing would otherwise read "0 converted" beside fifteen contacts they can
already spend. The two numbers on the Refer screen have to be able to explain each other.

### Referral scheme: automatic decision
The reward is owner contacts or free rent agreements, not money. The referrer's entitlement is
derived from the referral rows by `billing.entitlement`, counting those `ReferralStatuses#isGranting`
accepts, so a clawback needs no compensating write.

A referral qualifies on its first qualifying event: an owner's ownership verification (owner track)
or a first contact request accepted by an owner (seeker track). `ReferralQualification` then decides
without a desk queue, by risk band: high rejects, over the month or year cap rejects (`cap_reached`),
medium holds for `referralHoldDays`, low grants. `ReferralHoldSweep` releases or rejects due holds
hourly. `ReferralClawbacks` takes a reward back inside `referralClawbackDays` when the referee is
suspended or the qualifying listing is taken down or loses its verification. Staff `approve`,
`reject` and `clawback` remain overrides.

### Plan model
`Plan` maps `plans` (V8), seeded as reference data. Read-only from the app's point of view:
nothing creates or edits a plan, because a price list is a business decision made in the back
office and a migration. Plan administration belongs under `/admin/` with an audit trail. A
`price` of zero is a real plan, not a missing one — "Owner Free" is what every owner is on until
they upgrade, and `SubscriptionService` keys the entire payment decision off this being zero.

`Plan.listingLimit` is the paywall's real ceiling, kept as a number rather than parsed out of
`features` prose (D109). `null` means the plan grants no listing allowance of its own; every
reader resolves it to the free-tier floor of one. It is not a licence: an effectively uncapped
plan states a large number, and V24's CHECK forbids an owner plan from leaving it unstated at all.

`Plan.unlimitedContacts` (V91, D31b) is a separate column from `contactLimit` rather than a
convention over it, because `contactLimit` is nullable and its own comment admits `null` means
"unlimited or not-applicable" — two different answers stored identically, which is exactly the
question an entitlement check asks. It is `true` only on the three retired priced plans, which keep
it until they lapse. Since V107 a contact pack's `contactLimit` *is* read: it is the pack's bucket
size in `ContactAllocator`.

`Plan.kind` (V107) separates the retired subscription tiers (`plan`) from the one-off products
(`listing-pass`, `contact-pack`); `term_days` overrides `billing_cycle` for the latter, and
`active = false` takes a row off sale without touching what was already bought.

### Contract DTOs
`PlanDto` mirrors `plans` on the wire: `price` is whole rupees per `billingCycle` (`0` is the
free tier); `listingLimit` resolves to the free-tier floor of one when null and is never
unlimited; `contactLimit` is null for unlimited / not-applicable.

`ReferralDto` is the admin/ops fraud-desk view (spec fixes S52, S53, S54). Both mobiles are
masked because it is a paginated privileged list, following the same rule as `UserAdminService`
— unmasked reads are a separate, audited, single-record operation the contract does not declare
for referrals. `rewardAmount` is the count the track grants (owner contacts or free agreements), 0
until the referral qualifies; `track` (`owner`/`seeker`), `holdUntil` and `autoReason` show the
system's decision. `channel` is which side the referred party joined
on (not `shareChannel`, which is how the link travelled — D60). `sameDevice` / `sameIp` false
means "no evidence", never "proved different" — a code minted before V64 or a request without a
User-Agent produces no digest. `qualifiedAt` is null until the first qualifying event.
