# Flow: Ops Service Queues (shared back-office work queues)

> The back-office work queues for paid and assisted services and for customer conversations. Four
> kinds of surface carry the work: the **service-request desks** (rent agreement, legal, interior,
> packers, valuation), the internal **service tickets** (the *Customer tickets* tab on each desk and
> the Home Loans board), the **support chats inbox**, and the **flatmate moderation desk**. All read
> the live API, and the server scopes every read to the caller's own desks. Admins and managers see
> everything.
> **Status:** documented from React source and the Spring Boot services - **Primary role(s):** staff
> (desk-scoped), admin / manager (all desks)

---

## 1. Purpose & user problem
- **Persona:** an ops staff member on a vertical desk (Rent Agreement, Property & Legal, Home Loans,
  Interior & Renovation, Packers & Movers, Property Valuation), a support agent, or an
  admin/manager overseeing all desks.
- **Job-to-be-done:** "Show me only my desk's incoming work, let me take a matter, see what
  paperwork is still outstanding, read the parties' identity numbers while I hold it, talk to the
  customer, and move the matter through its lifecycle - without seeing other desks' work."
- **Why it matters:** paid/assisted services are a direct revenue line. These queues are where
  requests captured on the consumer side (see [`../consumer/services-calculators.md`](../consumer/services-calculators.md)
  and [`../consumer/rent-agreement.md`](../consumer/rent-agreement.md)) are actually fulfilled.
  The admin mirror of this desk is [`../admin/services-moderation.md`](../admin/services-moderation.md).

## 2. Entry points
- **Routes.** The back-office lives under `/admin/*`; a staff account reaches the same pages under
  `/staff/*` (`portalBase` in `lib/adminModules.js`). Each route sits behind a `ModuleRoute`
  permission check (`App.jsx`, `BACK_OFFICE_ROUTES`):

  | Route | Component | Module key |
  |---|---|---|
  | `/admin/rent-agreement` | `RentAgreementDesk` | `desk:rental` |
  | `/admin/legal`, `/admin/interior`, `/admin/packers`, `/admin/valuation` | `OpsDraftingDesk desk=<x>` | `desk:<x>` |
  | `/admin/home-loans` | `AdminServices desk="loans"` (the Home Loans ticket board) | `desk:loans` |
  | `/admin/support` | `SupportChatsInbox` (also behind the `support` feature flag) | `support` |
  | `/admin/flatmates` | `OpsFlatmateReview` (also behind the `flatmates` flag) | `flatmates` |
  | `/admin/referrals` | `OpsReferrals` - see [`referrals-fraud.md`](./referrals-fraud.md) | `referrals` |
  | `/admin/refunds` | `OpsRefunds` | `refunds` |
  | `/admin/kyc-review` | `OpsIdentityReview` | `kycReview` |
  | `/admin/leads`, `/admin/enquiries` | `AdminLeads`, `AdminEnquiries` | `leads`, `enquiries` |

- **Legacy paths.** `/ops` redirects to `/admin`, and `/ops/support`, `/ops/rent-agreement`,
  `/ops/legal`, `/ops/interior`, `/ops/packers`, `/ops/valuation`, `/ops/referrals` redirect to the
  same name under `/admin`. `/ops/flatmate-review` redirects to `/admin/flatmates` and
  `/ops/kyc-review` to `/admin/kyc-review`. `/ops/drafting-desk` redirects through `DeskRedirect`:
  `?type=<desk>` maps to that desk's path (`DESK_BY_VALUE[type].path`), anything else to `/admin`.
  Every other `/ops/*` path redirects to `/admin`.
- **Sidebar.** The *Service Desks* group lists one entry per desk (`SERVICE_DESKS` in
  `lib/adminModules.js`); *Support chats* sits in the *Support* group. A staff account sees a desk
  entry only for a desk listed in its `desks`.
- **Deep links.** A desk's `?tab=` style state is carried in the URL: `?view=tickets` opens the
  *Customer tickets* tab, `?open=<ticketId>` opens one ticket, `?request=<id>` opens one service
  request on its desk (a request that cannot be read raises a toast and the param is dropped).
  `ticketPath(ticket, open)` builds these links.
- **Source components:**
  - `src/pages/ops/OpsDraftingDesk.jsx` - service-request desk for legal, interior, packers,
    valuation (section 5.2).
  - `src/pages/ops/rent-agreement/RentAgreementDesk.jsx` and `RaCaseModal.jsx` - the rent-agreement
    desk and its case modal (section 5.2).
  - `src/pages/ops/service-queue/*` - shared pieces (`deskQueue.jsx`, `AgeTone`, `CancelDialog`,
    `DocumentChecklist`, `StaffWorkflowActions`, `PartyIdentities`, `RegistrationCheck`, `helpers.js`).
  - `src/pages/admin/AdminServices.jsx` and `useDeskTickets.js` - the service-ticket board (section 5.1).
  - `src/pages/ops/support-chats/SupportChatsInbox.jsx` - the support inbox (section 5.5).
  - `src/pages/ops/OpsFlatmateReview.jsx` - flatmate moderation (section 5.3).

## 3. Actors & roles
- **staff** - sees and acts on their own desks only. Enforced **on the server**:
  - `ServiceDeskAuthority.deskFilterFor(caller, team, desks)` ignores a `team` a staff caller does
    not own and fails closed (D44); `ServiceRequestQueryService` documents why there is no
    `?requesterId=` either - "a filter a client can set is a filter a client can remove".
  - `TicketService` is stricter: a staffer with no desk gets 403 `"Your account is not on an ops
    desk yet, so there is no queue to show."`, a staffer asking for another desk gets 403 `"You can
    only see your assigned queues."`, and a ticket outside the caller's desks answers 403 `"That
    ticket belongs to the <team> desk."`. A staffer who sends no `team` gets every ticket of their
    own desks plus tickets with no team.
  - The client's job is only to *say so*: the desk entries a staffer sees are their own desks, so
    an empty queue and a forbidden queue do not look alike.
- **admin / manager** - sees every desk and every ticket. Only admins and managers get the
  *Assign to* list in the ticket modal (it is loaded only when the role is not `staff`).
- **Permission atoms** (`lib/adminModules.js`, checked again by the server):
  - Desk modules need `services:read` (writes `services:write`); the Home Loans board needs
    `tickets:read` / `tickets:write`.
  - The *Customer tickets* tab on a desk is shown only with `tickets:read` (`useDeskTickets`).
  - The Support module is visible with any of `tickets:read`, `properties:moderate`,
    `properties:verify`, `flatmates:read`, `identity:read`, `refunds:read`, `services:read`
    (writes `tickets:write`). What a given agent sees inside it depends on their scope (section 5.5).
  - The flatmate desk is gated by `flatmates:read` / `flatmates:write`.
  - The registration check on a completed rental needs `registrations:write` (section 5.2).
- See [`../../system/cross-cutting.md`](../../system/cross-cutting.md) section 1 for the role/team model.
- **Trust caveat:** every desk reads the live seam, so each guard is a server decision and the
  client guard is only signposting.

## 4. Entities touched
Link definitions: [`../../system/data-model.md`](../../system/data-model.md).

- **Service ticket** (`tickets` in Postgres, read through `ticketService.js`) - an internal
  hand-off row for a service team. Read (paged list, summary, one ticket), updated (status,
  priority, assignee, team), appended to (notes). Never deleted; `closed` is a status. The wire
  shape is `TicketDto`: `id`, `subject`, `team`, `priority`, `status`, `propertyId`, `assignee` (a
    resolved display **name**, not an id), `service`, `customer`, `mobile`, `value`, `quotedValue`, `detail`,
  `notes[]` (`{by, text, at}`), `createdAt`. Writes go the other way as
  `TicketUpdate(status, priority, assigneeId, team)` - an **id** in, a **name** out, so the client
  never decides whose name appears against a claim. A ticket is raised from four places:
  - a staff agent in a support chat (section 5.5) - the customer is **not** notified;
  - a customer on a service landing page (`ServiceLanding`: Home Loans, Packers & Movers,
    Property & Legal) via `POST /tickets` with `desk`, `subject` and `body`;
  - a customer booking the Move-in Pack on the consumer Services page (`desk: packers`, with the
    accepted price as `quotedValue`);
  - the Move-in Pack "notify me" waitlist (`POST` waitlist endpoint, rate-limited per mobile,
    mobile unverified, no requester link).
  Only a back-office caller's `priority` is honoured on create.
- **Service request** (`service_requests` in Postgres, read through `serviceRequestService.js`) -
  the desk record. Read (paged queue, queue summary, one matter), updated (*take*, share draft,
  final document, cancel). The wire shape is `ServiceRequestDto`: `id`, `type`, `status`,
  `details {}` (free-form `jsonb`, D119), `documents[]`, `messages[]`, `timeline[]`, `assignee`,
  `amount`, `createdAt`, and `sla {waitingOn, dueAt, overdue}`. Identity numbers are **not** on it -
  they are a separate audited read (section 5.2). The consumer tracker reads the same server-owned
  request through its consumer-scoped endpoint.
- **Document checklist** (derived, `GET /service-requests/{id}/checklist`) - not an entity. Folded
  at read time from the request's own vault documents (D120): no checklist table, no `status`
  column a desk can tick, and therefore no way for "verified" to disagree with "there is a file".
- **Support conversation** (`support_conversations`) - one per customer; messages carry an *About*
  tag. See section 5.5.
- **Ticket and service request are separate work streams.** `TicketUpdate` has no request
  reference and `ServiceRequestDto` has no ticket field; neither queue mirrors the other.
- **Staff activity / audit** - ticket writes record `ticket.update` with the from/to status and team
  and the assignee id.

## 5. Business rules & logic  *(the meat)*

### 5.1 Service tickets (*Customer tickets* tab, `/admin/home-loans`)

Tickets are worked on `AdminServices` (`services/ticketService.js` → `GET /tickets`). It renders in
two places:
- as the **Home Loans** page (`/admin/home-loans`), with status tabs across the top - *Open*, *In
  progress*, *Waiting*, *Resolved*, *Closed*, *All* - each carrying a count from
  `GET /tickets/summary?team=`;
- embedded as the **Customer tickets** tab (`?view=tickets`) on the rent-agreement and the four
  drafting desks, with the same statuses as a *Status* chip row instead of tabs. The tab and its
  count (`summary.openTickets`, from the request queue summary) are present only for a caller with
  `tickets:read`.

The contract it works to:

| | server |
|---|---|
| statuses | `open`, `in-progress`, `waiting`, `resolved`, `closed` (`TicketStatuses`) |
| priorities | `low`, `medium`, `high`, `urgent` (`TicketPriorities`) |
| teams | `rental`, `legal`, `loans`, `interior`, `packers`, `valuation` (`Teams`); an unknown team is a 400 |
| assignment | `assigneeId`, a user id of a back-office account - anything else is a **404** `No such staff member to assign` |
| notes | `POST /tickets/{id}/notes`, one note, 1-4000 characters |
| shape | paged (`PageResponse`), 10 rows a page in the UI |
| scoping | `TicketService`, server-side (section 3) |
| writes | `PATCH` and notes need `tickets:write` plus the update-ticket capability; reads need `tickets:read` |

- **Filtering:** status (tab or chip), free-text search (id, customer, detail; 300 ms debounce),
  *Priority* chips (All, Urgent, High, Medium, Low), *Date* chips; *Clear filters* appears when a
  search, priority or date filter is set. Changing any filter returns to page 1.
- **Row content:** service or subject, status and priority badges, an age chip (green under 2 days,
  amber from 2, rose from 5; hidden once `resolved` or `closed`), customer and mobile, the assignee
  ("Unassigned" in grey) and the detail text.
- **Row actions** are status-aware:
  - **Claim** - shown when the ticket has no assignee and is not `resolved` / `closed`; assigns it
    to the caller. A claim does **not** advance the status.
  - **Start** - shown on `open`; sets `in-progress`. On an unassigned ticket, when the caller can
    list staff (admin / manager), it first assigns the first staff member listed for that desk.
  - **Resolve** - shown on `in-progress`; sets `resolved`.
  - **Open** - the ticket modal.
- **Ticket modal** (`?open=<id>` deep-links to it and moves the status filter to the ticket's
  status): details grid (request id, service, desk, status, priority, value, customer, mobile,
  created, assignee, detail), *Assign to* (the staff listed for the ticket's desk, default *Leave
  unchanged*), a *Status* select over all five values, the notes list (author, time, text) and an
  *Add an internal note* box. **Save** applies, in order: assignment, status (only if changed),
  then the note.
- **Priority** is shown as a badge and a filter; no control edits it. `PATCH` accepts a priority.
- **Notes** append through `POST /tickets/{id}/notes` with the server's own author and timestamp,
  so two colleagues writing in the same minute do not erase each other. `attachments` is accepted
  and dropped by the controller.
- **Export:** *Export CSV* downloads `draazy-service-requests.csv` of up to 100 rows matching the
  current filters (columns ID, Service, Desk, Customer, Mobile, Detail, Priority, Assigned, Status,
  Created).
- **Feature switch:** when the `services.enabled` option is off the page shows *Services module is
  disabled* with a link to Settings.
- **SLA:** none. There is no timer, breach flag or due date on a ticket - only `createdAt` and the
  age chip.

### 5.2 Service-request desks (`OpsDraftingDesk`, `RentAgreementDesk`)
`/admin/legal`, `/admin/interior`, `/admin/packers` and `/admin/valuation` render `OpsDraftingDesk`
for one desk; `/admin/rent-agreement` renders `RentAgreementDesk`. Both read the server directly. A
desk that shows an empty table when it simply cannot see the real queue is worse than one that
fails the request visibly (D184).

- **Stage tabs** (`stageTabs` in `service-queue/deskQueue.jsx`), each with a count from
  `GET /service-requests/queue-summary` and a status filter on `GET /service-requests/queue`:

  | Tab | Filter |
  |---|---|
  | To pick up | `status=new` |
  | My requests / My cases | `mine=true`, statuses `assigned, in-progress, changes-requested, approved, draft-shared, action-required` |
  | In progress | `assigned, in-progress, changes-requested, approved` |
  | With customer | `draft-shared, action-required` |
  | Closed | `completed` |
  | Cancelled | `cancelled` |

  The tab is in the URL (`useTabParam`, default *To pick up*). Callers with `tickets:read` get a
  seventh tab, **Customer tickets** (section 5.1), in the same tab bar.
- **Toolbar:** search (`q`, 300 ms debounce - an anchored prefix of the requester's name or mobile,
  or a whole request id; `%` and `_` are escaped server-side so a caller cannot unanchor the
  scan), an **Overdue** toggle with the count from the summary, and *Date* chips. Paged 20 a page.
  A failed read shows *We could not read the request queue. This is not an empty queue* with
  **Try again** - "an unread queue that renders as an empty one is how a desk goes home early".
  A **Refresh** button reloads the queue and counts. The rent-agreement desk also re-reads the
  summary every 60 seconds while the tab is visible and reloads the list when it changed.
- **Data scope:** `listServiceRequestQueue({type, status, mine, overdue, q, days, page, size})`. The
  scope is the **server's**: `ServiceDeskAuthority.deskFilterFor` derives it from the principal's
  role and ignores a `team` a staff caller does not own (D44).
- **Row content (drafting desk):** service, status badge, a *Yours* chip when held by the caller,
  the first detail value, requester name and full mobile, an age label, *Held by* (You / name /
  Nobody) and the amount charged (or *Free desk*). **Open** is the primary button when the matter
  is unheld or yours, a ghost button when a colleague holds it.
- **Row content (rent agreement):** flat and society, locality, request id, parties (owner →
  tenants), requester, deposit and term, holder and age, the rent, a *next step* sentence and a
  turn chip (*Our move* / *With customer* / *Closed*). A row held by a colleague is dimmed.
- **Ageing (`AgeTone`):**
  - A row that carries an `sla` shows *Customer's turn*, *Waiting for tenant details*, *Due in ...*
    or *Overdue by ...* (amber within two hours of due). Rent agreements carry one: pick-up 4 h,
    first draft 48 h, revision 24 h, registration 7 days (`RentAgreementSla`).
  - Otherwise the age since opening is amber from 24 h (*due soon*) and rose from 72 h
    (*overdue*); closed matters are muted.
  - An approved rental also shows *Register by <date>*: four months from draft approval
    (Registration Act s.23), amber in the last 30 days, *overdue* after it.
- **Request modal** (drafting desk): status, holder, requester, amount, an allow-list of detail
  fields (`DETAIL_FIELDS`, never a dump of the raw `jsonb`), the document checklist with *Files on
  this request*, the drafting actions, *Chat with customer*, internal notes, *Cancel request*,
  party identities and the timeline. The rent-agreement desk opens the richer `RaCaseModal` (case
  particulars, draft and approvals, messages, registration check, refunds, overlap check, amend
  terms, send-back-for-correction, *Next case*).
- **Take:** *Take this request* / *Take case* → `PATCH /{id}/status` → `assigned`. Self-take only;
  there is no assign-to-someone-else. Taking a matter a **colleague holds is a 409 naming the
  holder** (`ServiceRequestStaffTransitions.refuseSeizure`); an admin is exempt, because there is
  no release verb and a leaver's matters must stay drainable. The previous holder is kept in the
  audit row.
- **Documents:** `readServiceRequestChecklist(id)` → `GET /{id}/checklist` renders
  "*n* of *m* received" and **every** item, present or missing - the missing ones are the point.
  There is nothing to tick: the fold is derived on read, so the only thing that moves an item is
  an upload. A failed read says so rather than rendering as "nothing filed". *Files on this
  request* lists every `documents[]` row (customer uploads, each draft version, the registered
  copy) and opens it through `lib/openDoc.js`; a dev vault URL is refused with a toast rather than
  a blank tab.
- **Drafting workflow (`StaffWorkflowActions`):** *Share draft* (`POST /{id}/draft`, multipart, an
  optional customer note) while the matter is assigned / in progress / changes requested - each
  share is a new version; *Upload registered copy* (`POST /{id}/final-doc`) once the customer has
  approved, which completes the request. Only the **holder** (or an admin) may share a draft or
  upload the registered copy - an unassigned or colleague-held matter is a 409 naming who holds
  it. Moving an unheld matter to `in-progress` takes it, and a colleague-held one is refused like
  a seizure, so an approved matter always has someone to complete it. A shared draft reaches the
  customer at once: no second operator checks it first.
- **Registration check (`RegistrationCheck`, completed rentals):** the registered copy prepares one
  `rent_agreements` row per tenant, status `draft`, linked to the request and the uploaded document
  (V39). Tenant mobiles are **derived, never typed** by the desk: the wizard's `_state.tenants[]`
  (ignored in invite mode, and only valid Indian mobiles) plus accepted co-fill tenants. A request
  the listing's owner took no part in (neither requester nor accepted owner party) prepares nothing.
  A **second** operator opens that exact copy (*Open the registered copy*) and marks each row
  *Confirm registered* or *Not on the copy* (`PATCH /admin/rent-agreements/{id}`, body `{status}`
  only, row-locked); the uploader is refused (four eyes). The checker needs its own grant,
  `registrations:write` (staff baseline; `services:write` alone is 403, and the desk shows a note
  in place of the buttons), so an admin can scope makers who cannot check. Only a tenant who
  **proved the number by OTP** - the requester when not the listing's owner, or an accepted
  co-fill invitee - can be confirmed; a form-typed mobile shows a note, offers only *Not on the
  copy*, and is a 422 at the API. Only a `registered` row feeds the flatmate trust badge
  (`FlatmateTrustReconciler`), and only then does the tenant see the row and its copy under
  `/me/rent-agreements` (an unlinked legacy row likewise, minus its owner-typed URL). Mobiles are
  in full here (`GET /{id}/rent-agreements`).
- **Desk files are the desk's:** `POST /{id}/docs` refuses the `draft` and `final-document`
  categories (422) and any upload once the matter is closed (409), so a customer cannot plant a
  "Registered copy" for the checker.
- **Self-dealing:** a staffer or admin who is the requester, a party, anyone typed on the form (a
  tenant, the licensor or a co-owner - matched on the normalised mobile), or the listing's owner /
  posting staffer cannot take, share, cancel, upload or check that matter (403,
  `ServiceRequestSelfDealing`) - no admin exemption, as with property verification. They still
  read and decide the draft **as the customer**.
- **Messages (`OpenSupportChat`):** the desk holds no thread of its own. *Chat with customer*
  opens the requester's Support chat (a docked window on desktop, `/admin/support` on phone)
  tagged to this request; a staff reply there lands in the request thread (`POST /{id}/messages`
  stays the customer's route). Everything here is customer-visible.
- **Internal notes:** `InternalNote` with history on `entity_type = service_request` (V38) - the
  operator's private reasoning, never shown to the customer. A note typed before an action is
  filed beside it (*Draft shared*, *Registered copy uploaded*, *Cancelled*).
- **Cancel (`CancelDialog`):** a two-step action with a **required reason** (the `StatusRequest`
  `@AssertTrue` answers 422 without one). The reason is posted to the customer's thread and raises
  a `service.cancelled` notification in the same transaction, so the customer who paid is told why.
  Hidden once the matter is `completed` or `cancelled`.
- **Identity reveal (`PartyIdentities`):** the parties' identity numbers are a separate audited
  read (`GET /{id}/identities`, masked form at `/identities/masked`), available while the caller
  holds the matter (D151 / D173).
- **Not here:** per-document verify/reject and *Mark all verified* (the checklist is derived -
  D120), and a *Submit registration* step (`registration` is a status the contract refuses by
  name).

### 5.3 Flatmate moderation desk (`OpsFlatmateReview`, `/admin/flatmates`)
Titled *Flatmate Moderation*: "Publish, hide and badge flatmate rooms, groups and seeker posts."
Owner-tier posts are vetted through the listing's own docs; a sitting tenant's "I have a registered
rent agreement" is self-declared, so those badge requests land here before they earn a trust cue.
Full board-by-board behaviour: [`flatmate-moderation.md`](flatmate-moderation.md). Consumer-side
model: [`../consumer/flatmates.md`](../consumer/flatmates.md) section 5.

- **Tabs** (`QUEUE_TABS`): *Pending* (posts awaiting publish or re-check, and group applications;
  newest first), *Badge requests* (hosts asking for the Verified property badge; oldest first, with
  a count from the moderation summary), *Published* (approved and live posts plus cleared
  applications), *Hidden & removed* (flagged, removed, rejected, expired).
- **Sources:** `listFlatmateModeration`, `listGroupApplications`, `listFlatmateReviews`
  (`GET /admin/flatmates/moderation`, `/admin/group-applications`, `/admin/flatmate-reviews`) and
  `getFlatmateModerationSummary`. Each source is read at 100 rows; when a source holds more, the
  tab shows that the list is truncated.
- **Filters:** type chips (All, Room, Group, Seeker post), search, *Date* chips, *Clear filters*.
- **Badge decisions:** approve, or reject with a **required reason** (the host is told why).
  Documents open through the shared `lib/openDoc.js` scheme allowlist.
- **Gating:** `flatmates:read` / `flatmates:write` and the `flatmates` flag; there is no ticket
  mirror, no assignment and no SLA.

### 5.5 Support chats inbox (`SupportChatsInbox`, `/admin/support`)
The platform-wide view of customer support conversations. There is **one chat per customer**;
each message is tagged *About* a topic (property, flatmate, request, identity, invoice, general).
Source: `services/supportService.js` → `providers/http/supportProvider.js`.

- **Tabs** (`?view=`): *Waiting on us* (`awaiting`, the default), *Mine* (`mine`, offered only to an
  agent with full scope), *All*. Each carries a count from `GET /admin/support/chats/counts`; the
  list is `GET /admin/support/chats?view=&context=&page=&size=` at 30 a page. An **About** filter
  (`context`) narrows by topic (the *invoice* topic is labelled *Payments*). `?chat=<userId>`
  opens a chat and `?about=` pre-selects a topic. A live event stream
  (`GET /admin/support/chats/stream`) updates the list and counts.
- **Layout:** the open chat renders in `StaffChatPanel` beside the list on desktop, full screen on
  phone. A desk reaches the same chat through *Chat with customer* (`OpenSupportChat`,
  `GET /admin/support/chats/locate?type=&id=` resolves the customer).
- **Scope** (`SupportChatScopes`): a support agent or manager/admin has **full** scope and sees
  every chat. A staffer holding only desk functions sees only the topics their desk owns; a topic
  outside it is a 403 `"This chat topic is outside your desk."`, and a chat with nothing in scope
  is a 404.
- **Ownership:** replies go through `POST /admin/support/chats/{userId}/messages`. Assign
  (`POST .../assign`, default the caller) and **Resolve** (`POST .../resolve`) need full scope.
  Opening a chat marks the desk's side read (`POST .../read`); the customer's own unread state is
  untouched.
- **Service ticket:** the chat header has a **Service ticket** button for an agent with full scope.
  The form takes a *Team* (the six desks), a *Subject* (up to 200 characters) and an optional
  *Note* (up to 4000), and creates an internal ticket on that team
  (`POST /admin/support/chats/{userId}/service-ticket`, `TicketService.createForCustomer`). The
  customer is not notified, and a back-office account cannot be the customer (400). The ticket then
  appears in that desk's *Customer tickets* tab.
- **Identity cases:** identity disputes and appeals appear as topic `identity` and are visible only
  to a scope that includes it.
- **Customer side:** the customer's own chat is `GET /support/chat`, `POST /support/chat/messages`
  and `POST /support/chat/read`.
- Consumer-side model: [`../consumer/support-tickets.md`](../consumer/support-tickets.md).

### 5.6 Must move server-side
**Done for service requests:** the list read is scoped by `ServiceDeskAuthority.deskFilterFor`
(D44), take is a validated transition, and the document checklist is derived server-side rather
than ticked by a client (D120).

**Done for service tickets:** the list read is scoped by `TicketService` and refuses a desk the
caller does not own by name; status, priority and assignment are validated writes; notes are
appended by the server with its own author and timestamp.

**Done for the flatmate desk:** host verification, the D72 moderation boards and the
group-application queue all read and write the server. The agreement blob is still base64 in JSONB
- recorded debt, not a gap in the seam - and the reason-required-on-reject rule is the server's.

**Done for referral fraud review:** `ReferralsController` has its caller, and the
identity-verified-before-approve rule moved with it.

**Done for support chats:** scope, ownership, read state and the live stream are the server's.

Still outstanding:
- Notification/WhatsApp dispatch on transitions.

## 6. Maker-checker / approval
Applicable to the **draft approval step**. See the shared pattern in
[`../../system/cross-cutting.md`](../../system/cross-cutting.md) section 2.

> **Reachable from the desks** (section 5.2): *Share draft* is `POST /{id}/draft`, the customer
> decides through `POST /{id}/draft/decision`, and *Upload registered copy* is
> `POST /{id}/final-doc`. In dev the vault's signed URLs still do not resolve, so opening a file
> there is refused with a toast rather than faked.

- **Inverted maker/checker.** The **staff member is the maker** and the **customer is the
  checker** - the opposite of listing verification (where the customer proposes and staff approve).
  - **Maker = ops staff:** shares the deliverable and sets `draft-shared`.
  - **Checker = customer:** approves (`-> approved`) or requests changes
    (`-> changes-requested`, maker uploads a revised version and the cycle repeats).
  - **Approval needs the current version opened.** *View draft* posts `POST /{id}/draft/opened`,
    which records a `draft.opened` timeline entry for the requester only, once per shared version;
    approving without one is a 409 and the tracker keeps *Approve* disabled until then. A re-shared
    draft must be opened again. The click is the receipt, since the signed URL is fetched from
    storage, not the API.
  - **Approval side effects:** status advance, customer message, dashboard notification, and
    eventually the final document upload that completes the request.
- **Registration is a second, staff-side maker-checker** (rent agreements only): the operator who
  uploads the registered copy is the maker of the tenancy evidence; a different operator is the
  checker who moves each prepared row to `registered` (section 5.2). `registered` / `active` need a
  linked request and final document (422 otherwise), and an unlinked legacy row is admin-only.
- **Service tickets have no maker-checker**; they are a plain work queue (claim -> start -> resolve).

## 7. State machine

### 7.1 Service ticket (`TicketStatuses` - server-owned)
```
open  --(Claim)-->  open        <- a claim assigns; it does not advance
open  --(Start)-->  in-progress --(Resolve)-->  resolved
     \_______________ (Status select in the modal, any -> any) _______________/
```
- Five values: `open`, `in-progress`, `waiting`, `resolved`, `closed`. Any other value is a 400
  (`Unknown ticket status`).
- **No transition table.** `PATCH /tickets/{id}` accepts any legal status from any other, unlike
  `ServiceRequestStatus` (7.2) which refuses illegal moves. That suits a work queue: a ticket that
  turns out to be the wrong desk's, or that a customer replies to after it was closed, has to be
  able to go backwards without an ops person filing a second one.
- `UNRESOLVED` is `open`, `in-progress`, `waiting`; the waitlist signup uses it to avoid a second
  open ticket for the same mobile and service.
- Terminal in practice: `resolved` and `closed`, neither enforced.
- `waiting` exists so a ticket parked on the customer does not sit in `in-progress` looking like
  work in flight.

### 7.2 Service request (`ServiceRequestStatus`, server-owned)
Ten wire values, and the transition table is the server's:
```
awaiting-payment  -> new, cancelled
new               -> assigned, in-progress, cancelled
assigned          -> in-progress, draft-shared, action-required, cancelled
in-progress       -> assigned, draft-shared, action-required, cancelled
draft-shared      -> approved, changes-requested, in-progress, draft-shared, cancelled
changes-requested -> assigned, in-progress, draft-shared, action-required, cancelled
action-required   -> in-progress, cancelled
approved          -> completed, cancelled
completed, cancelled -> (terminal)
```
- `action-required` (rent agreements): the holder sent the case back to the owner or tenant for
  checklist papers to upload again and/or a question (`POST …/attention`); the side asked hands it
  back with `POST …/attention/resolve`, refused with 409 until every paper has a copy newer than
  the ask. It counts as the customer's turn (no desk SLA) and sits on the desk's **With customer**
  tab. Anything else the holder corrects directly (`PUT …/desk-details`, `PUT …/desk-identities`).
- `STAFF_SETTABLE = {assigned, in-progress, cancelled}`. Everything else is a consequence of an
  action (a draft shared, a decision taken), not a status a desk may pick.
- There is no `registration` status: it would be "the window between `approved` and the final
  document landing - a state with no decision in it, and therefore not a state".

## 8. Edge cases, validation & error states
- **Empty queue:** the service-request desks show a tab-specific message (*Nothing waiting to be
  picked up.*, *You hold no open requests.*, ...) or *No requests match these filters.*; the ticket
  list shows *No requests match*. The desks distinguish an empty queue from an unread one.
- **Asking for someone else's desk:** on the service-request desks nothing is denied and nothing is
  hidden by the client - the server answers with your own rows (D44). On tickets `TicketService` is
  stricter: another desk returns 403 `"You can only see your assigned queues."`, which the board
  prints rather than an empty table.
- **Loading and failure:** a failed queue read shows its own message and a **Try again** button; it
  does not fall back to zero rows, because "no work" and "no answer" are different days. A ticket
  that cannot be opened shows *This request could not be opened.*
- **Unassigned display:** a ticket shows "Unassigned"; a matter shows "Held by nobody" and must be
  *taken* deliberately - there is no auto-claim on open, because opening a matter to look at it is
  not the same as accepting it.
- **Checklist read failure:** says so, and explicitly does **not** render as an empty checklist -
  "nothing has been filed" is a fact about the customer, and getting it wrong sends a desk chasing
  documents it already has.
- **Dev vault documents:** a document URL that does not resolve in local development is refused
  with a toast.
- **Empty note:** a blank ticket note is not sent (`.trim()` guard, and `@NotBlank` server-side).
- **Concurrency / staleness:** every write is server-side. An invalid service-request move is
  refused by the transition table with a 409 whose sentence reaches the screen; a ticket write is
  last-write-wins on its fields, while notes only append.
- **Linked case not found:** `?request=<id>` that cannot be read toasts *That case could not be
  opened. It may have moved to another desk.* and the param is removed.
