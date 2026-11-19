# Flow: Rent & Tenancy Management

> The recurring side of renting, minus the money. **No rent moves through Draazy.** A tenant
> records one rental of their own and the server derives their yearly and lifetime totals from it;
> an owner keeps an auditable per-property rent ledger; both sides see a live tenancy. The
> tenant-to-owner payment rail (payments, autopay mandates, payout accounts, platform fee) was
> withdrawn in V127.
> **Primary role(s):** tenant (records), owner (ledger)

---

## 1. Purpose & user problem
- **Persona:** an active tenant who wants their yearly rent total and an HRA-ready figure without
  a spreadsheet; the owner who wants an auditable rent ledger for a property they let.
- **Job-to-be-done (tenant):** "Tell Draazy what I pay, once, and let it do the arithmetic my
  employer's HRA form and my own budgeting need."
- **Job-to-be-done (owner):** "See who my tenant is, what is due, and keep a ledger of received rent."
- **Why it matters:** keeps the *post*-deal relationship legible and closes the rent loop that
  [`./rent-agreement.md`](./rent-agreement.md) opens. It deliberately does **not** monetize it: Draazy
  is not a payments business, and a dormant money path costs more to keep honest than it earns.

## 2. Entry points
- **Routes:** `/pay-rent` - a `ProtectedRoute` that renders `PayRentComingSoon.jsx`
  unconditionally. Static: no API, no money. It survives as a route because the dashboard's "rent due
  soon" row needs an honest destination.
- **Tiles / triggers:** the dashboard **Rent Wallet** (Finances tab, tenant side) and "My Rental"
  cards; the tenancy row created when a rent deal is finalized.
- **Source components:** `pages/consumer/PayRentComingSoon.jsx` (the whole of `/pay-rent`);
  `components/dashboard/TenantFinancesTab.jsx` (the Rent Wallet);
  `components/dashboard/MyRentalPanel.jsx`; `src/services/rentService.js` +
  `providers/http/rentProvider.js` / `rentMapper.js` (`toRentalViewModel`);
  `src/lib/data/tenantFinance.js` (`hraExemption`, `depositInfo`, `fyLabel`);
  owner-side property finance `src/services/financeService.js`; HRA receipts (`generateSingle`).

## 3. Actors & roles
- **Tenant:** records one rental (address, landlord, rent, deposit, lease dates), reads the derived
  totals, edits or archives it. Must be signed in (`ProtectedRoute`); every read and write is scoped
  to the caller's token, and no path lets one tenant reach another's rental.
- **Owner (payee):** sees the rent ledger/dues for their properties via a separate `financeService`
  (`getTenant`/`getDues`) keyed to the owner's properties. **There is no owner-side view of
  `tenant_rentals` at all.**
- **Platform:** earns nothing here; no fee, no revenue ledger.
- **Guards:** `/pay-rent` is a `ProtectedRoute`; the tenancy write is cross-actor and server-authorized
  ([`../../system/cross-cutting.md`](../../system/cross-cutting.md) section 1).

## 4. Entities touched
Link to [`../../system/data-model.md`](../../system/data-model.md).
- **Tenant rental (the tenant's own record)** - `tenant_rentals` (V128), read and written through
  `GET|POST /me/rentals` and `PATCH|DELETE /me/rentals/{rentalId}` (soft delete). Columns: `address`,
  `monthly_rent`, `deposit`, `lease_start`, `lease_end`, `status`
  (`active`/`ended`), plus soft-delete and audit. **No `property_id`, deliberately** (the home a
  tenant rents is usually not a Draazy listing). `address` is personal data, so the table is wired into
  DSAR export (`DataExportScope`) and account erasure (`ErasureService`).
- **Tenancy** - `tenancies`, written cross-actor when a rent deal is finalized on this platform.
  A relationship, not a schedule: no instalments.
- **Owner rent ledger** - `transactions` under `/me/finances/{propId}/*`. The owner's record of
  recurring rent income (section 5.6).
- **HRA receipt** - `generateSingle(...)` receipt doc (downloadable, `receiptId`).
- **Tenant profile** - `tenant_profiles` (occupation/income/occupants/prior landlord/about). Read
  and written through `GET|PUT /me/tenant-profile`; the score is computed server-side (section 5.5).
- **Fees config** - there is no rent-payment percentage: `fees.rentPayPercent` was deleted with the rail.

## 5. Business rules & logic  *(the meat)*

### 5.1 The tenant declares once; the server derives the rest
A rental is written **once** — address, landlord name, monthly rent, deposit, lease start, optional
lease end — and the server computes everything the Rent Wallet shows from instalments elapsed since
`leaseStart`:

```
monthsPaid  = whole instalments elapsed since leaseStart (bounded by leaseEnd)
totalPaid   = monthlyRent * monthsPaid            // lifetime
fyPaid      = monthlyRent * months within the current April-March year
```

- These arrive **already computed** on the DTO. The financial year is defined once, on the server,
  so the screen and any export cannot drift apart by a month.
- No month-by-month entry and no payment records: marking a month paid would imply the platform knew it had been.
- `monthly_rent` is whole rupees (`bigint`), bounded by a check constraint. `monthlyRent * months`
  is a headline figure, so an absurd value produces an absurd dashboard rather than an error.

### 5.2 The Rent Wallet (`components/dashboard/TenantFinancesTab.jsx`)
Reads `/me/rentals` and **nothing else**. From the single self-declared record it shows: the
financial-year total, the lifetime total, months counted, the deposit's opportunity cost, and the
HRA exemption (`hraExemption` in `src/lib/data/tenantFinance.js`, against a basic-salary figure the
tenant types and which never leaves the device).

It works for the tenant who found their home through a broker, a friend or a noticeboard (almost
every Indian renter, none with a `tenancy` row).

### 5.3 The Rent Passport is sealed, on purpose
The Passport is the portable document a tenant hands a prospective landlord, headed **"Verified
rent-payment record"**. It is therefore **not** generated from the self-declared rental, and must never
be: every value on a rental is typed in by the person it flatters, and scoring a credential from it
would make the platform the author of a forgery. It stays locked until rent Draazy has actually seen
move exists to build it from. The Wallet says so on the card rather than hiding the section (an absent
panel and a withheld one read identically).

### 5.4 Tenancy status
- A **tenancy** binds tenant, owner, property, rent, deposit and start date, and is created when a
  rent deal closes on this platform (`TenancyService.openFromClosedDeal`). Upserted per
  property/owner pair, so no duplicate tenancy for the same flat.
- It carries **no instalments and no paid/unpaid position**, because nothing on the platform can
  observe one. The dashboard's rent-due row is derived from the lease's due day alone, and its only
  action is "Coming soon".

### 5.5 Tenant profile score (`TenantProfileService.score`, server-owned)
Reputation signal shown to owners, computed by the server and returned on `GET /me/tenant-profile`:
```
score = (verified ? 30 : 0) + (occupation ? 20 : 0) + (income ? 15 : 0)
      + (priorLandlord ? 15 : 0) + (about ? 10 : 0) + (occupants ? 10 : 0)   // capped at 100
```
The client does not compute this: the number an owner screens on cannot be one the applicant's
browser produced, so `score` and `verified` are absent from the write shape (`TenantProfileUpdate`),
not merely ignored.

`score` is **`null`, not `0`, when the tenant has never saved a profile** ("not assessed" vs "assessed,
scored nothing"): the Verified-Tenant meter renders a dash for the first and a 0% bar for the second. A
saved-but-empty profile does score 0.

### 5.6 Owner-side property finance (`src/services/financeService.js`)
Separate from the tenant's rent history: for an owner's rented-out property, the finance provider
exposes `getTenant`, `getDues`, ledger and payout helpers so the owner dashboard shows current tenant,
dues and received rent. Async (provider seam,
[`../../system/cross-cutting.md`](../../system/cross-cutting.md) section 6).

### 5.7 `/pay-rent` is a static page
`/pay-rent` renders `PayRentComingSoon` (value prop + waitlist) and nothing else. Any network request
originating from that route is a regression.

### 5.8 Ruling: the rent-payment rail was withdrawn (2026-08-24, executed at V127)

Online rent payment was first ruled **concept-only** (flag off, route already the coming-soon page).
Wired-but-dormant code has to be kept honest by tests and reviewers and earns nothing, so it was
deleted: the controller, the fee calculator, the payment/mandate/payout DTOs and the three tables
(`rent_payments`, `rent_mandates`, `payout_accounts`), along with `fees.rentPayPercent`, the
`onlineRentPayment` app flag, the `finance.rentPay` admin flag and every admin-finance figure that
described the rail. Dropping them beat leaving them empty (an empty `rent_payments` reads as a rail
that exists and has no traffic).

- **Do not build backend for it, and do not rebuild it by halves.** The old rail was visibly
  incomplete (a payout account could be linked and edited but never *unlinked*; paid-then-settled had
  no PSP behind it): symptoms of a feature nobody was finishing, not gaps to fill.
- **`/me/rentals` is not that rail returning.** It is a note the tenant writes about a home they rent
  elsewhere: moves no money, is not evidence, has no owner-facing side.
- **Nothing derived from it may reach the Rent Passport** (section 5.3).

Still live and must keep working: tenancies and tenant profiles, the owner P&L in
`MeFinancesController`, the tenant's own `/me/rentals`, and the tenant-side reads their specs cover.

## 6. Maker-checker / approval
- **Recording a rental:** no maker-checker and no counterparty; it is the tenant's own note, nobody
  else reads it.
- **Tenancy creation:** *is* the downstream of a maker-checker - written when a rent deal /
  agreement is finalized (owner accepts); approval happened upstream in
  [`./rent-agreement.md`](./rent-agreement.md).

## 7. State machine
```
Tenancy:        pending-setup --deal finalized--> active --(lease end / vacate)--> ended
Tenant rental:  (none) --POST /me/rentals--> active --PATCH status--> ended
                                                   --DELETE--> archived (soft delete)
```
- Neither has a month cycle. `monthsPaid` / `totalPaid` / `fyPaid` are **derived on every read** from
  `leaseStart` and the clock; no stored position, no per-month row.

## 8. Edge cases, validation & error states
- **Not signed in:** `/pay-rent` and the Rent Wallet redirect (`ProtectedRoute`).
- **No rental recorded:** the Rent Wallet shows an honest empty state with the form to add one. The
  common case: most tenants arrive with no `tenancy` row either.
- **No active tenancy:** the rent surfaces show an honest empty state. No fabricated demo tenancy
  (`seedDemoTenancy`, "Load a demo rental") exists any more.
- **A rental with no `leaseEnd`:** the normal state of an open tenancy; totals run to today (guessing
  eleven months would show a date neither party agreed to).
- **Deposit not remembered:** `deposit` is nullable, and zero is a *different* answer from unknown;
  the deposit panel says which it has rather than defaulting to `0`.
- **A typo in `leaseStart`:** bounded by a check constraint (no earlier than 1970), because a bad
  start date silently inflates every total.
- **Editing rent mid-lease:** a `PATCH` changes the figure for the whole derivation (no per-month
  history to preserve); a known simplification of a self-declared record.
- **HRA receipts:** `generateSingle` renders a receipt document whose figures are the tenant's own. An
  HRA claim is already self-reported to an employer; a *credential* is not (the line section 5.3 draws).
- **Cross-actor writes:** the tenancy is written server-side on deal close and authorized there. The
  tenant's rental has no cross-actor write — `tenant_id` is the caller, always.


---

## Tenant screening: score, badge batch reads

`TenantProfile` is keyed by `user_id` (a surrogate id would permit two profiles per user).
`score` and `verified` are server-owned (spec fix S17): a tenant who could set them would be grading the
signal owners rely on. `score` is recomputed on every save from the stored fields; `verified` mirrors the
identity badge from `identity.verification` and is never written from this feature.

Score weights preserve the formula the UI computed client-side, so no tenant's number moved when the
server took over. Verified identity is worth more than every other field except occupation because it
is the one fact a third party confirmed.

**Owner-side read (`GET /rent/tenant-profile/{mobile}`, spec fix S10).** 404 for every failure —
unregistered mobile, no profile saved, no relationship — all the same answer. The endpoint is keyed by the
identifier the contact gate protects, so distinguishing "no such number" from "exists but you may not see
it" would be a mobile-enumeration oracle. A relationship means an existing tenancy in either direction,
or an approved contact request from that person against one of the caller's listings.

**Batch badge read by mobile (`tenantsVerified`, tech-debt D114).** The verified tick renders beside every
row of a list; the single read per row would be an N+1 on a render path. Returns one bit per entry, never a
reason: "no such number", "registered but not verified" and "not your business" are all `false` (the S10
refusal shape), so callers cannot discover whether a number is registered. The relationship guard is
preserved (a batch that skipped it would be a cheaper way to ask what the single read refuses). Reads the
stored `verified` column, not a live badge lookup, so the two endpoints cannot disagree; a tenant who
verifies after their last save is briefly stale (no badge, never a badge nobody earned). Cap:
`MAX_VERIFIED_BATCH = 50`; an unbounded list is an amplification primitive, and the 400 says so rather
than silently truncating (an answer for half a list shaped like one for the whole would blank badges
unnoticed). Each distinct mobile is resolved once regardless of repeats.

**Batch badge read by user id (`verifiedAmong`, same D114 bug).** Callers projecting offers or
finalizations hold the user id and only a masked mobile (D5, `98XXXXX210`). Masking is lossy, so a
mobile-keyed question there always answers `false` (the D114 bug: a badge that could never appear against
the server). No relationship guard here, deliberately: the ids come from rows the caller is already a
participant on, so the server chose the subject and entitlement was settled upstream; a guard would only
blank the badge on the one screen it exists for.
