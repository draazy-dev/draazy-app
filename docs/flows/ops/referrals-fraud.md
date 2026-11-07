# Flow: Ops Referral Review (automatic decisions and overrides)

> Referral rewards are decided by the system, not by a queue. Each referral is scored at qualification
> and granted, held, or rejected automatically; rewards are taken back automatically on defined
> events. This desk is where ops **see** those decisions and **override** them (approve, reject,
> claw back). It is a review surface, not a work queue: referrals are not in staff "My work".
> **Primary role(s):** ops staff / admin (any ops user). Pairs with
> [`../consumer/plans-billing-refer.md`](../consumer/plans-billing-refer.md).
>
> Under **ADR-019 (badge-not-gate)** the identity/uniqueness check that guards a reward payout is
> legitimate here because it guards **money at risk** inside the opt-in reward flow — it is **not** a
> browse/post/contact gate (those stay at L1 mobile; see
> [`../../system/platform-architecture.md`](../../system/platform-architecture.md) §6.4 / ADR-019).

---

## 1. Purpose & user problem
- **Persona:** an ops/trust reviewer responsible for the referral rewards budget.
- **Job-to-be-done:** "See why the system granted, held or rejected a referral, and correct it when it
  got one wrong."
- **Why it matters:** rewards (rent agreement fee discounts, Featured days, free contacts) are a real
  cost and a classic fraud target. The automatic decision keeps honest referrers from waiting; the desk
  exists for the exceptions.

## 2. Entry points
- **Route:** `/ops/referrals` (under `RoleRoute roles=['staff','admin']` + `AdminLayout variant="ops"`;
  **no** `TeamRoute`, so any ops user can open it).
- **Source components:** `src/pages/ops/OpsReferrals.jsx`; data via `src/services/referralService.js`
  → `GET /referrals` and the three override endpoints.

## 3. Actors & roles
- **Staff holding the `referrals` function, or admin:** `referrals:read` lists, `referrals:write`
  overrides. Server-side enforcement is the rule; the browser only mirrors it.
- **The system** (`handled_by = 'system'`) makes every automatic decision.

## 4. Entities touched
- **Referral** (`referrals`): identity (`id`, `referrer`, `referrerMobile`, `referred`,
  `referredMobile`, `channel`), `reward` / `rewardAmount` (0 until qualified), `status`, `track`
  (`owner` | `seeker`, whichever qualifying event came first), `risk`, the signals
  (`identityVerified`, `identityUnique`, `activated`, `sameDevice`, `sameIp`, `velocityHigh`),
  `holdUntil`, `autoReason` and `at`.
  Both mobiles are in full, as on every back-office surface; checkers still decide on
  server-computed signals.
- **The referrer's rewards** are derived on every read by `billing.entitlement` from the granting
  referrals: each one is a referral credit worth `referralAgreementDiscountPercent` off the service fee
  of one future rent agreement (both tracks). There is no balance column, which is what makes clawback
  whole.
- **`referral_invites`** (migration 26.11.42) records every invite sent from `POST /me/referrals/invites`
  (`referrer_id`, normalised `mobile`, `delivery` of `sent`, `open_whatsapp` or `skipped`, `created_at`),
  including invites silently skipped. It drives the 30-day "already invited" rule, the daily invite cap
  and auto-attribution. Records are kept for up to 12 months. The same migration adds
  `referral_redeem_failures` (`user_id`, `ip_hash`, `created_at`) for the redeem lockout.
- **`referral_codes`** holds each user's code and the referrer's salted IP / User-Agent / device
  digests; **`properties.featured_days`** holds the per-listing Featured window an owner-track grant
  sets.

## 5. Business rules & logic

### 5.1 Settings (all admin-editable, `settings.fees`, validated with bounds)
`referralAgreementDiscountPercent` (50, bounds 1..100), `referralInvitesPerDay` (10, 1..100),
`referralRedeemFailuresPerDay` (5, 1..50), `referralSeekerBonusContacts` (5),
`referralOwnerFeaturedDays` (14),
`referralQualifyPerMonth` (10, calendar month IST),
`referralQualifyPerYear` (50), `referralHoldDays` (7), `referralClawbackDays` (30),
`referralVelocityPerDay` (5), `referralSignupWindowHours` (24), `referralSignalRetentionDays` (180, bounds 30..180),
`referralNewReferrerDays` (7), and `featuredDays` (7) for ordinary Featured. These replace the old
`referralContactBonus` and `referralOwnerRewardAgreements`. `GET /pricing` publishes
the reward numbers in a `referral` block; velocity, retention, new-referrer days, invite and redeem-lockout
limits are not published.
The `referralRewards` flag is the kill switch: off means invites and redeem are refused and nothing new is granted.

### 5.1a WhatsApp invites
`POST /me/referrals/invites { mobile }` sends a Meta MARKETING-category WhatsApp template
(`WHATSAPP_REFERRAL_INVITE_TEMPLATE_NAME`, `WHATSAPP_REFERRAL_INVITE_TEMPLATE_LANG`, sender
`WHATSAPP_REFERRAL_INVITE_PHONE_NUMBER_ID`, falling back to the main OTP sender number). If WhatsApp is
not configured or the send fails, the client gets `delivery: open_whatsapp` and opens the user's own
WhatsApp. Limits: `referralInvitesPerDay` per user in a rolling 24 hours (`429 invite_limit`); a number
invited by anyone in the last 30 days, with an existing account, or that replied STOP gets no message but
the same `200` (no membership oracle). Each delivered message costs about Rs 1 including GST, and Meta may
skip users who hit marketing caps. Ops need not act on individual invites; watch the WhatsApp
integration failures on the Integrations page.

### 5.2 Redeem and auto-attribution
`POST /referrals/redeem` is allowed only within `referralSignupWindowHours` of account creation, only
while the account has no listing and no contact request, and not from the referrer's own device
(`X-Device-Id`, salted-hashed like the IP and User-Agent). Every refusal is the **same 409**
("That referral code cannot be redeemed"): distinct messages would make the endpoint an oracle for
"is this a real code?", the reconnaissance step before farming one. After `referralRedeemFailuresPerDay`
failed redeems in 24 hours per user (not per IP: mobile carriers share one IP across many users, and each
account already costs an OTP), every further redeem is the same 409. The
referrer's digests refresh on every `GET /me/referrals`, so the comparison is against their current device.

**Auto-attribution:** when a new account is created (first OTP login) and its mobile has an invite in the
last 30 days, the earliest invite's referrer gets a `pending` referral under the same guards as redeem
(flag on, not self, not same device, signals from the request, `shareChannel = whatsapp`). A later
redeem by that user is the uniform 409.

### 5.3 Qualification and risk bands
A referral qualifies on its first event: the referee's listing passes ownership verification **and is
approved and publicly live** (owner track; if not live yet the row stays `pending` and qualifies when
it goes live), or an owner accepts the referee's first contact request (seeker track). The track is stored.
Signals: same IP /64, same User-Agent, same device id, velocity (≥ `referralVelocityPerDay`), a
referrer account younger than `referralNewReferrerDays`, and **no usable `X-Device-Id` at redeem**
(omitting the header must never be easier than sending it).

Seeker-track integrity: only a contact accepted on an **approved, publicly live** listing counts; on a
draft, pending, paused or archived one the referral stays `pending`. If the approving owner is the
referrer, the referral is rejected `self_dealing`. If the same owner already qualified another referee of
the same referrer in the last 30 days, the band is high. A `held` seeker row is re-checked at release
only for a suspended referee, a listing moderation rejected or flagged, and a referrer-owned listing; a
listing that was paused, rented, sold or archived meanwhile does not matter (it is a third party's).
Qualification is serialised per referrer (an advisory lock taken after the referral row lock), so the
month/year caps and the same-owner check cannot be beaten by concurrent qualifications.

| Outcome | When | Result |
|---|---|---|
| Self-dealing | the referrer approved the referee's contact | `rejected`, `autoReason = self_dealing` |
| High | velocity, or two or more signals | `rejected`, `autoReason = high_risk`, referrer notified ("couldn't be verified — contact support") |
| Cap | over the month or year cap | `rejected`, `autoReason = cap_reached` (no deferral) |
| Medium | one signal | `held` until `holdUntil` (`referralHoldDays`), `autoReason = medium_risk` |
| Low | none | `qualified` (granting) at once |

Every automatic decision is audited as `referral.auto.<qualified|held|released|rejected|clawback>`
with actor `system`. Correlation never refuses at redeem; it only raises the band.

### 5.4 Hold sweep and automatic clawback
- **Hourly sweep** (`ReferralHoldSweep`): a due `held` row becomes `qualified` if the referee is not
  suspended and the qualifying listing is still live and not taken down (seeker rows: not rejected or
  flagged by moderation, and not the referrer's); otherwise `rejected`. It also
  re-checks recently granted rows, as a backstop for events no hook sees (e.g. an edit that drops
  verification). Rows whose last decision was a staff override (approve, appeal) are never touched by it.
- **Clawback** within `referralClawbackDays` of the grant when the referee is suspended or archived
  (`referee_suspended`; archiving includes report enforcement), the qualifying listing is taken down by moderation (`listing_taken_down`), or
  its ownership verification is revoked (`verification_revoked`). On a seeker row the "qualifying
  listing" is the third-party listing the friend contacted: archiving or un-verifying it changes nothing,
  and only a moderation reject or flag does. A `held` row meeting the same events
  is rejected instead. The referrer is notified. Clawback applies to granting rows and removes the
  derived credit immediately. A credit already spent on a delivered agreement is not recovered; a credit
  held by a cancelled agreement returns to the referrer.
- **Referrer notifications:** the referrer gets an in-app notification when a reward is earned, held for
  checks, released from hold, rejected or clawed back, and on staff approve, reject or clawback.
- **Friend gift:** the friend's extra free contacts (`referralSeekerBonusContacts`) or Featured window
  (`referralOwnerFeaturedDays`) are given only while the row is granting (`qualified` / `rewarded`), not
  while `pending` or `held`, and are withdrawn on rejection or clawback.

### 5.5 Desk (overrides)
- **Approve** (from `pending`, `qualified`, `held`, `rejected`): `rewarded`. No identity-badge
  requirement.
- **Reject** (from `pending`, `qualified`, `held`).
- **Clawback** (from `qualified` / `rewarded` only): clawing back a referral that never paid would
  rewrite history.
- Rows show `track`, `holdUntil`, `autoReason` and `handledBy` (`system` or the staff user).
- Tabs and counts: `all`, `pending`, `held`, `highRisk`, `rewarded`, `refused`
  (`GET /referrals?counts=true`). The desk is server-paged (20 a page, newest first); `status` is a
  comma list, `risk=high` filters, `q` searches names, mobiles and id.
- Export covers the current page.

## 6. Maker-checker / approval
Automatic for ordinary decisions; ops overrides are the checker. See
[`../../system/cross-cutting.md`](../../system/cross-cutting.md) section 2.

## 7. State machine
```
pending --(qualify: low)--> qualified (granting) --(staff approve)--> rewarded
pending --(qualify: medium)--> held --(hold elapses, no problem)--> qualified
                                    \--(problem found)--> rejected
pending --(qualify: high | cap_reached)--> rejected
qualified | rewarded --(clawback event or staff clawback)--> clawed-back
```
- **States:** `pending`, `qualified`, `held`, `rewarded`, `rejected`, `clawed-back`
  (`ReferralStatuses`). `clawed-back` is not `rejected`: a reward never paid versus one paid and
  recovered.
- Staff approve works from pending, held, qualified and rejected. Approving a `rejected` row is an
  appeal: a non-blank reason is required (422) and goes on the row and the audit trail.
- Any other transition is a 409 naming the current status.

## 8. Edge cases, validation & error states
- **Read failed:** "The queue could not be read." with the server's message and Try again; never
  render a failed read as "no referrals here".
- **Concurrency:** decisions load the row under a write lock; a second decision on an already decided
  referral is refused with a 409. Automatic decisions run in the triggering transaction (hooks) or one
  transaction per row (sweep).
- **Flag off:** pending referrals stay pending and nothing is granted until it is switched back on.

## Appendix: implementation rationale

### Retention of correlation digests
`same_device` / `same_ip` need both sides of a comparison, so the platform stores a salted digest of
the referee's address, User-Agent and device id on `referrals`, and of the referrer's on
`referral_codes`. A request without a User-Agent or device id produces no digest, so the comparison
signals stay `false` (a missing device id is itself a risk signal, see 5.3). The digests are personal
data kept for one purpose, never on the wire, and blanked by `ReferralSignalRetention` after
`referralSignalRetentionDays`. The findings (`same_device`, `same_ip`, `risk`) outlive the evidence on
purpose: they are outcomes, not identifiers. The columns have no getters, the cheapest guarantee they
never reach a DTO. Time-based expiry is a different mechanism from a subject's erasure request; the
overlap is disclosed in `ErasureRetention#knownGaps()`.

### Reward amount
`reward` is a free-text label (for example "50% off next agreement fee") and `rewardAmount` its
magnitude (referral credits, 1 per granting referral), frozen when the referral qualifies; it is 0 and
neutral until then. Audit metadata names the unit (`credits`, not `amount`) so an append-only trail is
not misread.

### Code minting and normalisation
The alphabet excludes `I`, `O`, `0`, `1` because codes are dictated and read off phone screens.
Codes are minted on first read of `GET /me/referrals`, not at signup, and normalised (trim + upper).
Collisions are avoided by looking before leaping: a constraint violation poisons the persistence
context, so no retry is possible once one fires; a racing loser still gets the same 409.

### Channel and risk (queue read paths)
`ReferralMapper.channelOf` reads the referred party's current `listingsCount` (the lifetime tally):
somebody whose first listing was rejected still joined on the owner side. Not to be confused with
`Referral.shareChannel` (how the link travelled, D60).

### Idempotent qualification
`qualifyOn` moves a `pending` row exactly once; a retried verification, or a second property or
contact announcing against the same referral, mints nothing. A rejected row is never resurrected by
a later event. `uq_referrals_referred_mobile` admits one row per referred mobile, so "one reward per
referee, ever" needs no further constraint.

### Queue paging
`ReferralService.queue` resolves the page's referrer names in one query (`toDtos`). Both mobiles are
returned in full.
