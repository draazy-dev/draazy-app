# Flow: Admin Finance

> What Draazy collected, refunded and kept: this month's money, fees by month, the subscription
> book, money waiting on a decision, and the invoice/credit-note ledger.
> **Status:** live API - **Primary role(s):** admin

---

## 1. Purpose & user problem
- **Persona:** a finance / growth lead who owns the platform P&L.
- **Job-to-be-done:** "Show me what Draazy earned this month, where it came from, what went back
  out, and let me find any invoice or credit note."

## 2. Entry points
- **Route:** `/admin/finance`, tabs Overview and Transactions (`?tab=transactions`).
- **Source:** `frontend/src/pages/admin/AdminFinance.jsx` via `services/financeService.js` ?
  `providers/http/financeProvider.js`; backend `AdminFinanceService` + `AdminMetricsRepository`.
- **Reads (all admin-only):** `GET /admin/finance`, `GET /admin/finance/series?months=`,
  `GET /admin/finance/transactions?kind=&q=&days=&page=&size=`.

## 3. Actors & roles
- **admin** only. `finance:read` is administrator-only, so it can never be granted to an
  operations account. Route guards are UX; the endpoints enforce the role.

## 4. Entities touched (read only)
- `invoices` - one per confirmed payment (`source_type` subscription | service_request |
  service_request_amendment). `amount` is what the customer paid; `taxable_amount` is Draazy's fee.
- `credit_notes` - one per confirmed refund (`source_type` subscription | service_request_refund).
- `subscriptions` + `plans` - the active paid book behind MRR.
- `refund_requests`, `service_request_refunds`, `payment_disputes` - the "Needs attention" counts.
- Nothing is written here.

## 5. Business rules & logic

### 5.1 What counts as money
Invoices and credit notes are the only money. An invoice is issued only when the gateway confirms
payment (`SubscriptionService.applyWebhookOutcome`, the service-request webhooks), so a pending
checkout, a seeded subscription or a quote is never revenue. Days are bucketed on the Indian
calendar.

- **Collected** = sum of invoice `amount`. **Refunded** = sum of credit-note `amount`.
- **Pass-through** = (`amount` ? `taxable_amount`) on invoices, less the same on credit notes:
  stamp duty and registration collected for the government on rent agreements. Not revenue.
- **Net revenue** = Draazy's fees (`taxable_amount`) on invoices less those on credit notes.
  Always `collected ? refunded ? passThrough = net`; it can be negative.
- Subscription invoices have `amount == taxable_amount`; amendments carry no fee.

### 5.2 Overview tab
- **Needs attention** strip, shown only when something is waiting: pending subscription refund
  requests (? `/admin/refunds`), requested service refunds (? `/admin/rent-agreement`) and open
  payment disputes (? `/admin/refunds?tab=disputes`), each with its rupee total.
- **Tiles:** Net revenue (with MoM change from the series), Collected (invoice count), Refunded,
  MRR (active paid plans).
- **Revenue by month:** stacked fees per month - Subscriptions, Services, and Refunds as negative
  bars - over a 6/12/24-month window, with the window's net. Every month is returned, empty ones
  included; the current month's net equals the tiles'.
- **This month:** Collected ? Refunded ? Pass-through = Net revenue.
- **Active paid plans:** each active plan with its price, count and monthly value; sums to MRR
  (yearly plans count a twelfth, quarterly a third; free plans excluded).
- **Revenue CSV:** month, subscription fees, service fees, refunded fees, net.

### 5.3 Transactions tab
- Every invoice and credit note, newest first: number, date, customer name (never a mobile),
  kind (Subscription / Service / Refund), signed amount and Draazy's fee.
- Search (customer name or document number) and the Type filter are server-side; the Date chips
  send `days`. The screen holds the newest 100 matches and says so when more exist; **Export CSV**
  walks every page.
- Opening a row shows date, party, type, paid/refunded, Draazy fee and pass-through.

### 5.4 Also fed by this model
`/admin/kpis` `revenue30d` (admin only) is the net revenue of the last 30 days, by the same rules.

### 5.12 Refunds desk (`/admin/refunds`)
- Back-office function `refunds` (group "Trust & safety"; `refunds:read` lists, `refunds:write` decides; admins
  always). `GET /admin/refunds?status=pending_review|approved|rejected|auto|disputed&counts=true` is paged in the
  house envelope. Rows: `{id, status, kind, label, customerId, customerName, orderRef, amount, basis, customerReason,
  requestedAt, decidedAt, decisionReason, propertyId, creditNoteNo, signals{refunds12m, linkedAccounts, contactsUsed,
  enquiries, pausedDuringWindow}, transaction}`. `signals` is computed only for `pending_review` rows and is null on every other tab. `auto` rows are the system's own refunds (id = order id) and `disputed` rows the gateway disputes.
- `transaction` is the order behind every row: price, paid-at (the invoice time, or for an order that died unpaid
  the moment its refund fell due), order status, invoice number, and once money is due back the refund amount,
  `refundReason` (`paid_after_cancel`, `listing_gone`, `amount_mismatch`, `customer_request`, `gateway_dashboard`,
  stored on `subscriptions.refund_reason`), `refundState` (`queued` → `sent` once Cashfree accepts it →
  `confirmed` once its SUCCESS webhook lands, `subscriptions.refund_settled_at`; `retrying` after a refusal), the
  gateway refund id and attempts. The desk shows the reason in place of the customer's on the Automatic tab.
- The system refunds with no staff decision in three cases: a payment lands on an order already cancelled
  (the customer backed out, or the sweep expired the checkout); a listing pass is paid after its listing was
  archived, rented or sold; or the amount or currency paid is not the order's. Nothing is granted and the sum paid
  goes back.
- `POST /admin/refunds/{id}/approve` re-checks the facts, then queues the refund; `POST .../reject {reason}`
  (required, else 422) restores the entitlement. A second decision, or approving or rejecting while the gateway
  disputes the order, is 409. Both notify the customer (`refund.decided`) and are audited `refund.approved` / `refund.rejected`.
- New requests, automatic refunds and disputes notify holders of `refunds` (`refund.requested`, `refund.auto`,
  `refund.dispute`), linking to `/admin/refunds`.
- A refund made by hand on the Cashfree dashboard reaches us through the same refund webhook under Cashfree's own
  refund id, and is matched by order. Once it succeeds it is recorded on the order (so no queued refund is sent
  again), earns its credit note, closes a waiting request as approved, tells the customer (`refund.completed`) and
  `refunds` holders (`refund.auto`), and is audited `subscription.refundedOutside`. Only the whole price ends the
  pack or pass; a partial one leaves it live. A second dashboard refund on an order already refunded changes
  nothing and alerts the desk. Without a customer request it shows on the `auto` tab.
- A credit note (`CN-FY2627-000001`) is issued when a refund is confirmed paid; it cites the original invoice (`INV-FY2627-000001`, issued when the payment succeeded),
  and `/me/payments` shows both numbers. An order that was never invoiced (a failed, late or mismatched payment refunded automatically) gets no credit note.

## 6. Maker-checker / approval
- None on this page: it is read-only. Refunds are decided on the refunds desk (5.12) and per
  service request; the attention strip links there.

## 7. State machine
- None owned here. Ledger kinds are document types, not states.

## 8. Edge cases, validation & error states
- **Failed read:** the overview shows "Could not load the finance overview." with Retry; a failed
  ledger read shows "Could not load transactions." with Retry, never the empty-ledger copy.
- **Empty book:** every tile reads ?0, "No active paid plans.", no attention strip.
- **Negative month:** refunds above fees render as `???`, never `?-?`.
- **Bad input:** an unknown `kind`, or `months` outside 1-60, is a 400.

---

## Payment webhook: signature, raw body, idempotent, always 200

`POST /webhooks/cashfree/payment` is the source of truth for whether a purchase was actually
paid for. The synchronous 201 on a checkout only says an order was created; this is what tells
a customer they were charged. Four rules govern it, and each exists because dropping it opens a
specific hole.

1. **Signature-verified.** The route is `permitAll` because a provider has no user session;
   authenticity is an HMAC over the raw body (`WebhookSignature`). Without it, anyone who
   learned the URL could mark any order paid. `x-webhook-timestamp` is signed alongside the
   body so a captured callback cannot be replayed under a new time.
2. **Raw body, not a bound object.** The signature covers the exact bytes sent, so the body
   arrives as a `String` and is parsed here. Letting Spring bind and re-serialize would change
   key order and whitespace, and every genuine callback would fail.
3. **Idempotent.** Deduped on `data.order.order_id`, which every settling family stores under
   a unique constraint. Cashfree may redeliver, and each family's state machine refuses to move
   an order that has already settled.
4. **Always 200.** A bad signature, malformed JSON and an unknown order all return the same
   empty 200. A provider that sees an error retries forever, and a differentiated response would
   let a prober confirm which order ids are real. The one exception is deliberate: if this JVM
   cannot supply HMAC-SHA256, the verifier throws rather than reporting the sender as malformed,
   because answering 200 to a fault on *our* side would drop every payment callback for as long as
   it lasted and guarantee no retry. Unreachable on any standard JRE; the rule is stated so that
   the next reader does not "fix" it back into a 200.

The payload is nested (`data.order`, `data.payment`); the contract used to document a flat
body Cashfree has never sent, so a faithful implementation would have silently never fired.

Lives in `finance` because three unrelated families settle here: subscriptions, paid
service requests and amendments. Each side ignores an order id it does not own, so all three are always
offered the event rather than guessing from the payload which it was. Each gets its own
try/catch: a shared one meant a failure in the first path returned 200 without the others being
asked, and Cashfree does not retry a 200. A paid webhook that matches nothing (or has a handler
throw) is logged loudly and unreconciled — the two causes are distinct log lines because they
route paging to different places.

`payment_time` seeds the settlement instant for every family that settles from the
callback. Falls back to now when absent or unparseable rather than failing the
callback: the fact of the payment matters more than the exact stamp. `payment_amount` is
parsed to whole rupees for a reconciliation check against our own ledger, never to overwrite
it — reading the amount back off the callback would let the provider's rounding become our
revenue figure. The decimal ? whole-rupee conversion lives in one place; a lossy conversion
duplicated across a codebase is a reconciliation bug waiting to happen.
