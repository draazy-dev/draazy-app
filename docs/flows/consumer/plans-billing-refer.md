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
  rewards, 7 days of Featured after ownership verification.

### Platform fees (`settings.fees`)
- Keys: `listingPass`, `contactPack`, `rentAgreementPlatform`, `gstPercent` (0: prices include GST),
  `freeContactLimit`, `referralContactBonus`, `referralQualifyPerMonth`. Published by `GET /pricing`;
  editable in Admin → Settings → Fees. The charged amount is always the plan row's `price`.

### Entitlements / gating
- **Listing tier (soft gate).** 1 free live listing (live = approved or flagged), plus the referral
  bonus, plus one per active pass. Posting and drafting are never refused. When moderation approves
  a listing that would exceed the tier it is stored **paused**; My Listings offers "Get a pass" →
  `/checkout?plan=listing-pass&property=<id>`, and a paid pass resumes it. An owner resume over the
  tier is a **422 `listing_quota_exhausted`**; pausing or archiving another listing frees the slot.
  `GET /me/entitlements` → `listings {allowance, referralBonus, used, passes[{propertyId, expiresAt}]}`
  (`used` = live listings no pass covers). Flatmate posts never count; the 3-active-post cap on
  non-owner hosts stays as an anti-broker guard.
- **Owner-contact quota (derived, D31b + Q16b).** A "contact" is the right to open one
  `contact_requests` row. `ContactAllocator` replays the caller's contacts, oldest first, against
  buckets: **free** (`settings.fees.freeContactLimit` = 15, usable until 30 days after the first
  contact, once per account), each paid **pack** (15, valid 30 days from payment) and **referral**
  contacts (never expire). Each contact spends the valid bucket that expires soonest; `remaining` is
  what is left in buckets valid now. Nothing is stored, so a repeat press on the same listing and a
  refused press cost nothing. A legacy unlimited plan stays unlimited until it lapses. Read from
  `GET /me/entitlements` → `contacts {unlimited, used, allowance, remaining, referralBonus,
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

> **Corrected 2026 (D233).** The two bullets below used to read, without qualification:
>
> > **Code:** `referralCode()` = up-to-4 uppercase letters from the user's name (else `PUNE`) + last
> > 4 digits of mobile (or a random 4-digit number), persisted at `dzReferralCode:<mobile>`.
> >
> > **Stats:** `dzReferralStats:<mobile> = { invited, joined, listed }`.
>
> That described the whole product, and it was the bug. The server mints its own permanent code in
> `referral_codes` (V23), format `PUNE-AB12`, and `POST /referrals/redeem` resolves only that one —
> so every link the product produced pointed at a scheme that could not recognise it. `Refer.jsx`
> now reads `code` and `invited` from `GET /me/referrals`.

- **Code:** `GET /me/referrals` → `{ code, invited, converted, contactsEarned,
  contactsPending }`. The page renders nothing in the share card until it resolves, because a Copy
  button that writes `""` and then reports "Copied" is the quiet kind of wrong.
- **Link:** `referralLink(code)` = `<origin>/signup?ref=<code>` (drives `?ref` capture on signup).
- **Redemption:** `Signup.jsx` calls `POST /referrals/redeem` when a `?ref=` is present, alongside
  the local `setReferredBy`. Un-awaited and silent on failure — a 409 means the code was unknown,
  self-referred or already used, none of which the new account holder chose or can fix.
- **Stats:** the whole progress narrative is the server's since D234. `invited` is
  `ReferralSummaryDto.invited` (people who have redeemed the code), `listed` is `converted` (those
  that qualified or were approved). `dzReferralStats:<mobile> = { invited, joined, listed }` is
  written by nothing. Its incrementers are gone:
  `addReferralInvite` counted button presses under the name "You've invited N", and
  `addReferralJoin` / `addReferralListing` were ungated ways to mint quota that nothing ever called.
- **Invite counting is honest:** a share opens WhatsApp or the OS sheet and then simply re-reads
  `GET /me/referrals`. Nothing this page does to itself moves the number — previously a completed
  share bumped a local tally, which drifted further from the truth the more the page was used.
  Copying the code or link has never counted, for the same reason.
- **Reward rules (targets in code):**
  - `referralListingsTarget = 3` — **owner track:** every 3 qualified referrals = 1 free rent
    agreement, reported as `agreements.free` on `GET /me/entitlements` and derived per request like
    every other bonus, so a clawback takes it back. The progress bar shows `converted % 3 / 3`.
    Until D234 this was `floor(listed / 3)` over a localStorage counter — it survived clawbacks and
    could be re-minted by clearing site data. **There is no `used` or `remaining`**, deliberately:
    agreements are not sold through this codebase yet, so a consumption tally would be a number
    nothing decrements. `REFERRALS_PER_FREE_AGREEMENT` is a separate constant from
    `REFERRALS_PER_LISTING_SLOT` even though both are 3, because they are two offers sharing a
    divisor rather than one offer read twice.
  - `referralContactsPerReward = 15` - **seeker track:** each qualified referral = **+15 owner
    contacts**, and since D31b that grant is the server's. `GET /me/entitlements` reports
    `contacts.referralBonus`, derived as `count(referrals that are qualified or rewarded) ×
    settings.fees.referralContactBonus` — recomputed on every read rather than added to a balance,
    which is what makes a clawback whole: there is no grant to reverse. The listing-slot bonus is
    `count / 3` from the same read.
  - **Currency, settled (D31b).** The server used to pay ₹500 of platform credit, which nothing could
    be spent on, while this page granted quota — "two different currencies, and no arithmetic turns
    one into the other" (register item 31). It was closed by moving the server onto the browser's
    unit rather than the reverse: `referrals.reward_amount` is now a **count of owner contacts** and
    `reward` reads `"+15 owner contacts"`. `settings.fees.referralReward` is gone; `freeContactLimit`
    and `referralContactBonus` replace it.
- **Attribution honesty:** `setReferredBy(code)` records who referred a new signup
  (`dzReferredBy:<mobile>`) and deliberately credits nobody. `POST /referrals/redeem` carries the
  attribution, and `ReferralQualification` credits the referrer when the referee's first listing
  passes ownership verification — "the only qualifying action a browser cannot fake". D234 removed
  the browser-side credit ledger that used to sit alongside it (`creditReferrerForJoin` on signup,
  `creditReferrerForListing` on a first post, drained by `claimReferralCredits()` in `AuthContext`):
  it granted quota on the same machine that spent it, paid twice if the referee posted from a second
  device, and went on paying forever after the fraud desk clawed the referral back.

### Referral fraud signals
Each referral carries the fields an ops fraud queue scores on: `risk` (low/high), `channel`
(owner/seeker), `reward`, `identityVerified`, `identityUnique`, `sameDevice`, `sameIp`, `velocityHigh`,
`activated`, and `status` (`qualified` -> `rewarded`, or `pending`/`flagged`/`rejected`), plus
`handledBy`/`handledAt`. These drive the admin/ops referrals-fraud review (self-clone, the same
document behind two accounts, same-device/IP, high velocity = flagged/rejected). The identity check
here is a **reward-payout uniqueness** guard (`identity_hash`), part of the opt-in reward flow (L2/L3)
— **not** a browse/post/contact gate, which stay at L1 mobile (ADR-019).

## 6. Maker-checker / approval
- **Plans/checkout:** no maker-checker (self-serve purchase).
- **Referral rewards:** effectively maker-checker at the ops layer - the consumer records the
  invite/join/listing (maker), but qualifying and paying out a reward is gated by fraud review
  (checker) before `status` moves to `qualified`/`rewarded`. See
  [`../ops/referrals-fraud.md`](../ops/referrals-fraud.md) (planned) and
  [`../../system/cross-cutting.md`](../../system/cross-cutting.md) section 2.

## 7. State machine
```
Pass / pack:    pending (Cashfree order) --signed webhook--> active --term ends--> expired
                listing pass also ends when its listing is rented, sold or archived
Over-tier listing: pending --approve--> paused --pass paid / slot freed--> approved
Referral:       (per RF row) pending -> qualified -> rewarded
                            \-> flagged -> rejected   (fraud signals)
```

## 8. Edge cases, validation & error states
- **Unknown/missing `?plan=`** -> redirect to `/plans`. **Signed-out checkout** -> redirect to signin
  with `next`.
- **Second pass for the same listing** -> 409; packs are deliberately re-purchasable and stack.
- **Over the free tier** -> the listing is saved and approved into `paused`; resuming it without a
  pass or a free slot is `422 listing_quota_exhausted`.
- **Featured** is never sold: 7 days from ownership verification, re-granted on re-verification.
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
`REFERRALS_PER_LISTING_SLOT = 3` matches the "refer three owners, list one free" offer. Integer
division: the fourth referral earns nothing extra until the sixth — the offer is a whole slot or
none.

`REFERRALS_PER_FREE_AGREEMENT = 3` matches the "refer three, get an agreement free" track. It is
a separate constant from the listing one even though the values are equal today: they are two
offers, and pricing may move either without meaning to move the other.

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

### Referral scheme: automatic qualification (Q17, D31b)
The reward is owner contacts, not money (D31b). Redemption stamps a label and a magnitude onto
the row and those two are what the fraud desk reads and the audit trail records; nothing here
pays anything out. The referrer's actual entitlement is derived from these rows by
`billing.entitlement`, by counting the ones `ReferralStatuses#isGranting` accepts.

Q17's automatic `QUALIFIED` transition — the referee's first listing passing ownership
verification — used to be a hint for the checker and is now the grant point. `approve` still
matters: a fraud desk uses it to bless a referral that did not qualify on its own, and `clawback`
takes a grant back. What changed is that an honest referrer no longer waits in a queue for
something the platform already verified for itself. The exposure is bounded by the D61 monthly
cap and by what is being handed over: the right to ask fifteen owners a question.

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
for referrals. `rewardAmount` is a count of owner contacts, not money (was rupees pre-D31b — see
`Referral` rationale for the two-era column). `channel` is which side the referred party joined
on (not `shareChannel`, which is how the link travelled — D60). `sameDevice` / `sameIp` false
means "no evidence", never "proved different" — a code minted before V64 or a request without a
User-Agent produces no digest. `qualifiedAt` (Q17) is null until the referee's first listing
passes ownership verification.
