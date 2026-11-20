# Draazy — Open Questions

**Status:** living document. Companion to [`tech-debt.md`](./tech-debt.md).

**What belongs here.** Anything blocked on a *decision* rather than engineering time — product calls,
unresolved contradictions between two parts of the system, and questions whose answer changes what we
build rather than when. It is separate from the tech-debt register so that register stays 100%
actionable and this file stays 100% a decision queue.

**Lifecycle.** Answer → record the answer here with its date → move the resulting work into
`tech-debt.md` (or straight into a slice) → mark the question **CLOSED**. A question is never
deleted; the answer is the valuable part.

---

## Engineering decisions blocking specific work

### Q19 — When an owner withdraws a confirmed stay, what happens to the review it authorised? *(blocks D204)*

Raised 2026-08-11 by the D194 security review. D194 made a self-declared tenancy into real evidence
once the listing's owner confirms it, with a revocation path (an owner who agreed by mistake, or was
deceived, must be able to take it back). Eligibility reads the live status, so revoking closes the
review composer at once. It does not reach backwards: `ReviewService.createForProperty` freezes the
standing into the review's `context` badge at write time, so **confirm → publish a "Tenant" review →
revoke** leaves a published review wearing a badge whose evidence has been withdrawn.

Three answers; the obvious one is the worst:

1. **Retract the review on revoke.** Symmetrical, but hands every owner a delete button for
   criticism: confirm the stay, wait for a bad review, revoke. That is what the eligibility rule and
   the contact gate exist to prevent, and it makes the confirm step dangerous to the tenant who asked
   for it.
2. **Leave the review exactly as it is.** Safe against retaliation, but the badge asserts a fact the
   platform no longer holds, and a reader cannot tell.
3. **Keep the review, drop its badge to `NONE`, and say so on the card.** The claim does not outlive
   its proof, and the change is visible. Needs a decision on the card text — "the owner withdrew
   confirmation of this stay" is honest and is also an accusation, so phrasing is a product call.

A second half no phrasing fixes: an owner can confirm an alt account they control — list, declare
from a second number, confirm, publish one glowing tenant-badged review of yourself. The declaration
row carries `owner_id`, `declarant_id` and `decided_at`, and every decision is audit-logged, so ops
can *find* this afterwards; stopping it needs an identity signal the platform does not collect.
Whether that is acceptable at launch scale is part of the same ruling: option 3 is only worth
building if the evidence it protects is worth something.

Carried in `tech-debt.md` as **D204**.

**Partly answered in code — option 2, not option 3.** `TenancyDeclarationService.revoke` is
**forward-only by design** and touches no review: a review written while the stay was confirmed stays
published with its `tenant` badge; revoking only stops the *next* one being authorised.
`TenancyRevocationIsForwardOnlyTest` pins both halves, so **option 1 is closed — retraction must not
be added** (it would hand the reviewed listing's owner a one-tap silencer, and the declaration
evidences that the reviewer was really there, which revoking cannot alter).

**Still open:** the whole of option 3 — whether a revoked stay should drop the published review's
badge to `NONE` and say so on the card, and what the card should say — plus the alt-account half.

**Owner:** product. **Status:** OPEN — narrowed to the badge-drop and card copy. Carried on D204.

---

### Q20 — Should the administrator who creates a back-office account be allowed to set its credentials? *(closed)*

Closed by the single-admin bootstrap decision. `POST /users/staff` no longer creates administrators,
staff accounts are invite-redeemed, and the staff-account pending-approval queue no longer exists.
D206 is closed for this flow; unrelated badge/listing/service maker-checker questions remain separate.

---

## Product / GTM questions (from the trust-model pivot)

Source: `docs/system/platform-architecture.md` §6.4, ADR-019.

### Q6 — Freshness ping cadence

"Still available?" pings plus auto-expiry are the **top-priority anti-spam lever** in the badge-not-gate
model — what replaces mandatory KYC as the staleness defence. The cadence (and what happens on no
reply) is undecided, with a backing-column consequence: there is no freshness column, which is why the
`dormant` status is unimplemented.

**Owner:** product. **Status:** OPEN.

### Q7 — L1 contact-reveal vs chat-only

Does an L1 (mobile-verified) user get the owner's number on approval, or in-app chat only? Same
decision as Q2 from the buyer's side; it determines whether the contact gate's payoff is a phone
number or a thread.

**Owner:** product. **Status:** OPEN.

### Q9 — Which five localities launch first?

Corridor GTM (Hinjewadi–Wakad–Baner) is the recommendation on record; the five are not chosen. Seed
data and the locality reference table are built, so this is a data decision, not a schema one.

**Owner:** product. **Status:** OPEN.

### Q10 — Phase 0 gate: 50 hand-recruited Pune owners

The trust-model roadmap sets this as a **gate before further product build**: hand-recruit 50 real
owners with real listings, to validate that supply can be acquired without brokers. The backend has
since been built well past that gate. That is not necessarily wrong (the backend is a fixed cost), but
the gate should be honoured or consciously retired, not silently passed. **Recording it as
passed-by-default is the thing to avoid.**

**Owner:** founder. **Status:** OPEN.

---

### Q11 — Flatmates: what is the gate, and does it monetise?

Rescued 2026-08-08 from `docs/feature review/02-flatmates-market-and-feature-review.md` before that
document was deleted. Q9 and Q10 carry neither the flatmates-specific number, its window, nor the
monetisation half — the part that decides what Flatmates *is*.

Proposed gate: **100 verified rooms/groups across Hinjewadi–Wakad–Baner within 60 days, with at
least one paid move-in service sold.** The halves are deliberately separate; the second matters:

- Listings arrive **and** something sells → Flatmates is a product line.
- Listings arrive but **nothing sells** → Flatmates is a cheap acquisition funnel for the rent
  business, staffed and prioritised as one — not given its own roadmap.

This matters now because the build is well past the discovery surface (groups, applications,
moderation and host verification shipped); deciding after more machinery is deciding by sunk cost.

**Owner:** founder. **Status:** OPEN.

---

### Q12 — Flatmates: matching quality vs more moderation machinery

Also rescued from the same deleted review. The stated differentiator over a WhatsApp group is "shows
me people I'd actually live with" — **compatibility matching**, not filtering. Neither exists
server-side: D116 records that the three flatmate controllers accept ten compatibility facets and
silently ignore all of them.

The next unit of Flatmates work is a fork:

- **Matching** — make the ten facets real, then rank rather than filter.
- **Moderation** — more host verification, queue tooling, review states.

The review's position was that moderation was being built ahead of the thing users came for — a
prioritisation call, not a defect, so it lives here. D116 fixes the contract bug either way; this
decides whether anything is built *on top of* it.

**Owner:** founder / product. **Status:** OPEN.

---

## Closed

Q20 (closed) stays in the section above.

### Q8 — Do brokers have a place on Draazy? *(closed 2026-10-11)*

**Answer: no.** Draazy is strictly broker-free: owners, buyers and tenants only, with no broker role,
flag, plan or listing label.

**Owner:** founder. **Status:** CLOSED.

### Q15 — What must a listing carry before it can claim "verified"? *(closed 2026-08-11)*

**Answer: three required artefacts — ownership proof, owner identity, physical existence.** RERA
cross-check was *not* selected (it only applies to new projects; the registry integration is a project
of its own). Moderator discretion alone was explicitly rejected.

| Artefact | Accepted evidence |
| --- | --- |
| Ownership proof | Property tax receipt, electricity bill, or Index II |
| Owner identity | A government document (Aadhaar, PAN or driving licence) + selfie, staff-reviewed |
| Physical existence | Timestamped photos or a video walkthrough |

**Why it matters.** `ListingService` had *no* document gate — "verified" was a moderator's opinion
with no required evidence. That is how a "Society Verified" badge rendered for buildings nobody had
confirmed exist (the catalogue fabricated `registration: true` for unknown slugs, D101). A badge
grantable without evidence is decoration, and the badge-not-gate thesis in ADR-019 rests on the badge
meaning something.

**Consequence:** verification becomes a *checklist with state*, not a boolean. Each artefact needs its
own upload, review outcome and expiry (a 2019 tax receipt proves nothing today). Tracked as **D190**.

### Q16 — Which surface is the primary revenue engine? *(closed 2026-08-11)*

**Answer: none of the four yet — deliberately.** The cold-start problem outranks monetisation. Owners
and seekers must both be active before any surface is worth charging for, so the **referral programme
exists specifically to route around the paywall** during the liquidity build. Of the paid surfaces,
**the rent-agreement service is the main revenue source for now.** Consequences:

1. **The owner paywall is a growth *tax* in this phase, not a revenue line.** Anything making the
   free tier harder to reach works against the primary goal. The one-free-listing limit should be
   measured on suppression, not conversion.
2. **Rent agreement must not break.** It is the only surface taking real money, so its failure modes
   are "revenue incident", not "bug". Its fee maths is gated by `check:finance` (26 checks); that gate
   is load-bearing and stays strict.
3. **Contact reveals and subscriptions stay built but quiet** — the mix we return to once liquidity
   exists (see Q16a).

**Follow-on (Q16a) — the *threshold* is deferred, the *mechanism* is not.** What liquidity level flips
monetisation on is a founder call that wants evidence we do not have, so pinning a number now would
only mean changing it under pressure. **Ruling 2026-08-11: build the gate as configuration, default
off, number unset.** Nothing may hardcode a liquidity constant or launch date; every monetisation
switch reads its threshold from config, so the decision is a deployment change, not a code change.

Constraints on whoever sets it:

- **Depth, not total.** A platform-wide listing count is satisfiable by spreading thin: 500 listings
  across the catalogue's ~155 localities is three per locality — a Baner searcher sees three results
  and leaves; the same 500 across ten localities is a real market in ten places. The threshold must be
  *per locality* (candidate: listings per active locality, plus the count of localities clearing it),
  never a platform sum.
- **Per-locality rollout, not a global switch.** Paid features can be on in Baner while Kothrud stays
  free; a city-wide switch can only be wrong everywhere at once.

Q10's "50 hand-recruited owners" and Q11's flatmates gate remain the two numbers on record.
**Owner:** founder. **Status:** mechanism decided; threshold OPEN, deliberately.

**Follow-on (Q16b) — the MVP price list *(decided 2026-10-11)*.** Subscriptions are retired; nothing
auto-renews. The only paid items are the rent agreement (₹499 + government charges, first or
renewal), a listing pass (₹999, each extra *live* rent/sell listing beyond 1 free, 60 days) and a
contact pack (₹199, 15 contacts for 30 days, after 15 free in the first 30 days). Flatmate posts
are free and unlimited; the 3-active-post cap on non-owner hosts stays as an anti-broker guard. Over
the free tier a listing is never refused: it waits paused until the owner buys a pass or pauses
another. Featured is a 7-day reward for ownership verification, not a paid boost. Lawyer and loan
partners are commission-only and carry no user-facing price. Target: ~₹10,000/month covers infra.

### Q17 — What counts as a genuine referral? *(closed 2026-08-11)*

**Answer: credit only on a qualifying action.** Not verified-mobile (a SIM costs less than the credit
it mints), not referee identity verification (too much friction on the surface buying liquidity), not
manual review (does not scale and delays the reward that makes referrals work).

**Interlocks with Q15 and Q16.** Referral credits offset the paywall (Q16), so a fraudulent referral
costs listing quota rather than cash — but buys the fraudster *supply-side spam capacity*, which the
trust model exists to keep out. Since Q15 requires real documents before verification, the qualifying
action is one already expensive to fake:

> **A referral credits the referrer when the referee's first listing passes verification** — i.e.
> clears the Q15 document gate.

Minting a credit then requires a genuine property with genuine ownership proof, not worth doing for a
free listing slot. No new fraud machinery; the document gate does the work twice.

**Current state:** implemented server-side. `ReferralQualification` is the `billing` end of the
`VerificationAnnouncer` port: when an owner's listing clears the document gate, the pending referral
for that mobile moves to `qualified`, once, under a row lock — first-ness and idempotency are the same
guard, so a second verified listing mints nothing. V64 records how the link was shared (D60) and
salted digests of each party's address and browser so `sameDevice` / `sameIp` are computed instead of
hardcoded `false` (D55, ninety-day retention), and a configurable cap
(`settings.fees.referralQualifyPerMonth`, 3/month and 10/year since 2026-11-08) sends the overflow to
the fraud desk rather than rejecting it — the flatmate case D61 protects still works.

**Closed by D31b.** The remainder of D191 (the *client* half) is done, and the product decision went
the other way from what this entry assumed. There is no exchange rate, because there are no longer
two currencies: the server stopped paying a ₹ credit (which nothing could be spent on) and now pays
**owner contacts**, the unit the scheme has always advertised. `settings.fees.referralReward` is
gone; `freeContactLimit` and `referralContactBonus` replace it, and `referrals.reward_amount` is a
count.

The quota moved with it. `lib/store/contactQuota.js` — a `dzContactsUsed:<mobile>` counter the browser
wrote, a referral bonus the same browser minted, and a limit the same browser enforced *before* making
any request — is retired. `GET /me/entitlements` reports the allowance and `POST /contacts/request`
refuses with a 422 `contact_quota_exhausted`. Both numbers are **derived**: `used` is a count of
`contact_requests` rows (a repeat or refused press costs nothing), and the referral bonus is
`count(qualified or rewarded referrals) × referralContactBonus` recomputed per read, so a clawback
takes its contacts back with no grant to reverse. The old module lives at
`services/providers/mock/contactQuota.js` as the mock server's state and is not re-exported from
`lib/store.js`.

**Deliberately still open, and narrower than it was:** superseded by Q17a below.

### Q17a — Two-sided, automatically verified referrals *(closed 2026-10-12)*

**Answer:** two tracks, both sides rewarded, no manual desk. Every number is a `settings.fees.referral*` key.
- **Owner track:** qualifies when the referee's first listing passes ownership verification (Q17 trigger). The
  referrer gets a free rent agreement per referral; the referee's listing is Featured 14 days instead of 7.
- **Seeker track (new):** qualifies when the referee's first contact request is accepted. The referrer gets 15
  contacts; the referee gets 5 extra free contacts.
- **Automatic verification:** a code redeems only at signup (24 h, no listing or contact yet, not the referrer's
  device). At qualification a risk check grants (low), holds 7 days (medium) or rejects (high); calendar-month and
  yearly caps reject the overflow; suspension, take-down or revoked verification claws back within 30 days. The ops
  desk is audit plus override (an appeal needs a reason). The listing-slot reward is gone (pay-per-use, Q16b).

### Q17c — One simple referrer reward, WhatsApp invites by number *(closed 2026-11-06, supersedes Q17a's rewards)*

**Answer:** both tracks pay the referrer the same thing: one credit per qualified friend, worth
`referralAgreementDiscountPercent` (50%) off the service fee of one future rent agreement (statutory charges never
discounted). The 15-contact and free-agreement rewards are removed (pre-launch, no grandfathering). The friend's gift
applies only once qualified; owner track also needs the listing live. Friends are invited from the Refer page by
mobile (`POST /me/referrals/invites`, WhatsApp marketing template from the OTP sender, `wa.me` fallback), and an
invited mobile auto-attributes at sign-up. Flow: `docs/flows/consumer/plans-billing-refer.md`.

### Q17b — Refunds: what comes back, and who decides? *(closed 2026-10-12)*

**Answer:** refund only what was not delivered, decided from server facts; every number is a `settings.fees` key.
- **Contacts:** a request counts until the owner declines it or it lapses after `contactReplyDays`; then it comes
  back. Open requests are capped at `contactPendingMax`; paused, let or sold listings take no requests or approvals.
- **Pack:** full refund within `packRefundDays` if no contact was spent from it. **Pass:** no-enquiry guarantee
  (≤ `passGuaranteeMaxEnquiries` from start to claim, never paused in the first `passGuaranteeDays`, once per
  `passGuaranteeEveryMonths` across linked accounts).
- **Every customer refund is approved by staff** (`refunds` function); the order is frozen while pending.
  Money taken in error (failed, late, mismatched, closed listing) is refunded automatically.
- Sequential invoices and credit notes per FY; a dispute freezes only that order, never the account; grievance
  officer in `legal`.

### Q18 — What should the ops console be allowed to see and act on? *(closed 2026-08-11)*

**Answer: scope by team, with admin-defined per-user permission sets.** The admin creates each ops
user and chooses that user's permissions directly, rather than picking from fixed role bundles.

**This is what `settings.customRoles` was reaching for — it must be rebuilt on the other side of the
wire.** That field was removed because the admin console computed a *widening* permission set
(`BASE ∪ role-bundle ∪ moduleAccess`) while the server's `PermissionMap` may only ever *narrow*;
honouring the client's set would have been privilege escalation, so the client-side version was the
inverse of this answer.

Server-side, in order:

1. A **permission catalogue** — the closed set an ops user may be granted, derived from
   `PermissionMap` so a grant can never exceed what the server enforces.
2. **Persistence** — a per-user grant set. `roleId` and `moduleAccess` exist nowhere server-side: no
   column, claim or endpoint.
3. **The claim** — grants reach the request as a verified claim, not anything the browser can assert.
4. **Admin UI** — user creation with a permission picker, following existing console patterns.
5. **Enforcement stays server-side.** The UI hides what a user cannot do; the server *refuses* it.

Until this lands there is **one flat admin role**: every moderator sees every listing, user and
payment. Tracked as **D192**.

### Q3 — Legacy `enquiries`: implement or formally deprecate? *(closed 2026-08-09)*

**Answer: (c) remove it from the spec entirely.** The removal was already done — the
`GET /enquiries` path and `Enquiry` schema were dropped from the OpenAPI spec in slice-12 (S45) and the
`enquiries` table in V22 — so only doc hygiene remained, now complete: the stale `Enquiry`-schema row
and `enquiries` ER relationship were removed from `data-model.md`, and register item **D17 was
deleted**. The frontend `/admin/enquiries` funnel is a separate deals/leads *metric* surface,
deliberately untouched.

### Q4 — Should there be a cap on saved-searches *count* per user? *(closed 2026-08-09)*

**Answer: yes — max 10 per user.** Implemented in `SavedSearchService.create`: a user already holding
ten gets `409 Conflict` ("delete one to add another"). Ten is far beyond a genuine set of standing
alerts while bounding the workload any future scheduler re-runs. Documented on
`POST /me/saved-searches` and covered by `SavedSearchCapTest`. No register item — shipped inline.

### Q5 — `reels.locality`: display names or slugs? *(closed 2026-08-09)*

**Answer: (A) carry both — a display caption and a slug, mirroring `Property`.** A reel's caption
stays a display label ("Koregaon Park") because that is what the clip says on screen; the feed
filter moves to a new `reels.locality_slug` column ("koregaon-park"), the locality vocabulary every
other surface keys on. The frontend sends the slug it already holds, and the caption is not forced
into a machine key. Shipped in V38 (add column + backfill by joining the curated `localities` table +
index), the `R__` seed carries a slug per reel, `ReelController` filters on
`findByLocalitySlugIgnoreCaseOrderByCreatedAtDesc`, the `/reels` `locality` param is documented as a
slug, and `ReelSlugFilterTest` covers it. Register item **D16 was deleted**.

### Q1 — What is a valid mobile on input? *(closed 2026-08-09)*

**Answer: (A) normalise, then validate — tolerant input, strict storage.** A new `@IndianMobile`
composed constraint (backed by `IndianMobileValidator`) replaces `@Pattern(Formats.MOBILE)` on every
mobile *input* field. It accepts what people type — spacing and a `+91`/`0091`/`0` country code — by
delegating to `MobileMask.normalise()`, then gates the *normalised* value against the stored
`Formats.MOBILE` shape (`^[6-9][0-9]{9}$`). That second gate matters: `normalise()` fails closed on
length only, so without it a ten-digit number with a leading 1-5 would pass the edge and then be
rejected by a column CHECK as a 500. Because a `ConstraintValidator` cannot mutate, each consuming
service normalises at the persist/lookup edge — `AuthService.login`,
`ConversationOpeningService.start`, `CityService`,
`RentAgreementService`, `FlatmateSupplyService.ownerConsent`, `UserAdminService.addStaff`, plus the
finalization/close paths that already did. The OpenAPI `Mobile` schema keeps its strict pattern as
the stored/returned shape and carries a description noting the input tolerance. The frontend was
already hardened: the shared `MobileField` renders a fixed `+91` chip and accepts only ten digits.
Covered by `IndianMobileValidatorTest` plus updated edge tests in `DealEndpointsTest` and
`ConversationEndpointsTest`. Register item **D23 resolved**.

---

### Q2 — Can owners hide their number even after approving a request? *(closed — D5)*

The frontend mock has a `hideNumber` preference; there was no `users.hide_number` column or contract
field. Against: approving a contact request *is* the act of sharing a number — a preference that
silently un-does it makes the approve button mean two things, and buyers will read it as a bug.
For: some owners want in-app chat only, a coherent (and different) product. Overlaps Q5 — if the
answer to Q5 is chat-first, this preference may be the wrong shape entirely.

**Answer, revised 2026-10-03 by user decision:** `users.hide_number` shipped in V31, rides
`PATCH /auth/me`, and reaches the client as `ownerHidesNumber` on `ContactStatus`. It sits on
`users` rather than `properties` because the number is the person's, not the listing's. The old D5
global policy (no gate status ever handed a buyer digits) is superseded: approval reveals the owner's
number to that requester unless `hide_number` is true, and the owner sees the approved requester's
number.

**Owner:** product. **Status:** CLOSED. D5 is closed and no longer in the register.

---

### Q13 — Should scoped back-office accounts exist server-side at all? *(closed — D192/D13)*

Raised 2026-08-11 while removing `settings.customRoles` (D67). The admin console has a Team & Access
model — a per-user `roleId`, a `moduleAccess` list, named custom-role bundles — and **none of it
exists on the server**: no `users.role_id`, no `module_access`, no claim, no team-member endpoint. It
lived in browser storage — a feature only ever drawn.

Three questions, the first deciding the other two:

1. **Per-account scoping at all, or per-team?** Access was `role` plus `users.team` plus the
   `permissions` allow-list, enforced and narrowing correctly. Per-account scoping means a
   team-member management slice — invite, assign, revoke, audit — not a column.
2. **If custom roles return, must they only narrow?** `PermissionMap`'s rule is that a stored
   document can only ever remove access; the console computes `BASE ∪ role-bundle ∪ moduleAccess`,
   which adds it. A widening document is a privilege-escalation surface, so it cannot be adopted as
   drawn. Narrowing-only is implementable; widening needs a story for who may grant what, and a
   guarantee nobody grants beyond their own authority.
3. **What does a "module" grant mean server-side?** The bundles name client modules
   (`enquiries`, `content`, `properties:verify`); the server has four `Capabilities`, three enforced.
   Either modules map onto capabilities (agreed as policy) or a new route-level vocabulary is
   designed. Neither is a backend chore.

Interim: the key was deleted (`V61`) and writing it is refused with 422, so the console cannot
accumulate access rules nothing honours. On 2026-08-10 custom roles moved out of the settings
document into a console-local collection, so nothing the mock would hand to `PUT /admin/settings`
carries the key, and the Custom roles tab was labelled *console-only — not enforced by the server*
(labelled rather than deleted because removing the UI would answer question 1 by attrition).

**Answer: yes — per-account scoping, narrowing-only, over a server-served catalogue.** All three
sub-questions shipped as **D192**. (1) `account_permissions` scopes one *account*, re-read per request
on top of `role` + `users.team` — the server half of the Q18 ruling. (2) A permission document may
only ever *remove* access; the console's widening model was not adopted in any form, and
`AccountPermissionsGuardTest` pins the narrowing. (3) No new route-level vocabulary: the atoms stay
the ones the server enforces (`BackOfficePermissions.CATALOGUE`), so the write refuses anything
outside the catalogue. `BackOfficeAccessController` holds the routes behind `users:read` /
`users:write` — the same atom as minting a colleague, since editing who may do what is the same
privilege — and refuses self-edit. `AdminTeam.jsx` reads and writes the server's set instead of
browser storage, and the `V61` refusal of `settings.customRoles` stands.

**Follow-on:** narrowing produced the old D200/D206 administrator-minting concern; Q20 is closed by
single-admin bootstrap and staff-only account creation.

**Owner:** product, then backend. **Status:** CLOSED. D13 is closed and no longer in the register.

---

### Q14 — Does an owner's edit take the listing offline, or does it stay live and get flagged? *(closed 2026-08-11 — D76)*

Raised 2026-08-10. Two coherent designs for what happens after an owner edits an approved listing;
the codebase shipped one of each.

- **The server's:** `ListingService.update` calls `Property.revertToPending()` whenever a foundation
  field changes, so the listing leaves search until a moderator re-approves it. Safe, and the
  strongest anti bait-and-switch — nobody sees the changed listing until somebody has looked at it.
- **The client's Tier A/B model:** the edit stays live and is flagged for a fast re-check. Kinder to
  the owner and to the number the platform lives on — a listing that goes dark for a day every time
  its price moves teaches owners not to move the price.

They are different products, not a bug and a fix. What was not defensible was the client describing
the second while the server did the first, so the owner-facing banner now reports the server's rule
truthfully (D76) and `npm run check:listing` keeps it that way. Remaining questions:

1. **Does a price change really need a takedown?** Price is the most-edited field and has the weakest
   bait-and-switch argument — the buyer sees the new price either way.
2. **If some foundation edits stay live, which?** Locality and property type are identity; price and
   furnishing are not. A split set is implementable (`apply` already returns one boolean; it would
   return two) but is a policy decision about what a moderator protects against.
3. **Is "live but flagged" enough of a control?** It needs a queue that is actually worked, and an
   SLA — otherwise it is a flag nobody reads and the rule has become opt-in.

**Answered 2026-08-11 — neither design wholesale; the set splits.**

- **Stays live, re-checked in the background:** `price`, `furnishing`, `possession`.
- **Goes off search, reverts to `pending` as before:** `locality`, `propertyType`, `bhk`, `deal`.

The line is what the edit does to the *claim*, not how much the value moved. The second group changes
what the listing fundamentally is, so a stale index entry would mislead searchers (a 2BHK under 3BHK,
a rental under sale is a wrong answer). The first changes an attribute of the same property, so the
worst case is a briefly out-of-date number. Fraud risk is handled by the re-check either way; the
difference is only whether the listing earns while it waits.

Sub-questions in order: (1) No. (2) The split above; `apply` returns an `EditImpact` record rather
than one boolean. (3) "Live but flagged" needed a work item that was neither `pending` nor `flagged`
(which also removes the listing from search), so `V62` adds `properties.recheck_requested_at` +
`recheck_reason` beside `flag_reason`, `GET /admin/properties?recheck=true` is the queue, and
`PATCH /properties/{id}/status` with `approved` clears it. The queue UI shipped 2026-08-11 (a
stays-live re-check nobody is shown is a loosened control): `/admin/properties` has a **Re-check
Queue** tab (oldest first, changed fields and waiting age, pass or reject via the existing status
transitions, count in the tab label and a KPI). **The SLA itself is still not answered**: the tab
escalates its age colour at 24h and calls a row overdue past 72h, but those numbers make the age
legible, not an agreed commitment — nothing enforces them, alerts on them or pages anyone. Deciding
the real SLA (and whether breaching it should auto-revert the listing to `pending`) remains open,
carried as **D264** (D76 itself is closed and removed from the register).

**Owner:** product, then backend. **Status:** CLOSED (2026-08-11), except the SLA residual (D264).
