# Flow: Ops Flatmate Moderation (verification, publication, group applications)

> The live trust-and-safety desk for the flatmate marketplace. Three boards on one page:
> **Verification** (is this host who they say they are), **Moderation** (may the city see this) and
> **Group applications** (a group asking an owner for a whole flat).
> **Status:** on the live API since wave 2c part 3 - **Primary role(s):** staff / admin holding
> `flatmates:read` (queues) and `flatmates:write` (decisions)

---

## 1. Purpose & user problem
- **Persona:** a trust-and-safety operator running the flatmate side of the marketplace.
- **Job-to-be-done:** "Stop the fake, brokered or abusive share posts before a seeker meets a
  stranger through them, and clear the honest ones quickly enough that honest supply still bothers."
- **Why it matters:** Flatmates is the one place on the platform where strangers agree to share a
  home. Rooms and groups with a flat start invisible and this desk is what makes them visible, so a
  backlog here is not a queue getting long - it is a marketplace with no supply. Seeker posts and
  hunting groups (no flat to verify) go live at once and arrive here as *Live · not yet reviewed*
  re-checks, to be cleared with **Looks fine** or pulled.

> **Why this desk exists at all.** A retired `/admin/flatmates` screen already moderated seekers,
> groups and applications. Converting it would have been the smaller change, but it
> only ever knew **one** of the two verdicts a flatmate row carries, has never been able to show a
> group application (nothing could create one), and cannot see rooms at all. This page is the whole
> surface, live.

---

## 2. Entry points
- **Route:** `/ops/flatmate-review`, inside the back-office guard. Nav entry "Flatmate"
  (`AdminLayout.jsx`).
- **Source components:**
  - `src/pages/ops/OpsFlatmateReview.jsx` - the page: three tabs (Pending / Published / Hidden &
    removed) over one card list, and the popup.
  - `src/pages/ops/flatmate/useFlatmateQueue.js` - fans out to every source a tab covers and merges
    them into one list keyed by post id (a badge claim keys on its room/group id), so one flat is
    one card with every reason it is waiting.
  - `src/pages/ops/flatmate/FlatmateQueueCard.jsx` - the card: type, headline, reason chips, Review.
  - `src/pages/ops/flatmate/FlatmateReviewModal.jsx` + `review-modal/` - the popup. `PostDetails`
    (photos, free text, details, host), `BadgeSection` (verification axis), `DecisionSection`
    (publication axis, including "Looks fine" for a re-check).
  - `src/pages/ops/flatmate/board.jsx` - `Tabs`, `QueueState`, `Block`, `fmtDate`.
  - `src/services/flatmateService.js` -> `providers/http/flatmateProvider.js` ->
    `flatmateModerationMapper.js`.
- **Server:** `FlatmateModerationController` / `FlatmateModerationService`; the popup's read is
  `GET /admin/flatmates/{id}` (`FlatmateModerationDetails`).

---

## 3. Actors & roles
Every route is fenced twice: `hasAnyRole('STAFF','ADMIN')` **and** a permission atom -
`flatmates:read` for the three queues, `flatmates:write` for every decision. Both are registered in
`BackOfficePermissions.CATALOGUE` as `ops(...)` rather than `adminOnly(...)`, so an unscoped staff
account holds them; a stored per-user document can narrow that, never widen it.

---

## 4. Entities touched
| Table | Read | Written |
|-------|------|---------|
| `flatmate_reviews` | the Verification board | `status`, `reason` |
| `flatmate_seeker_posts` / `flatmate_rooms` / `flatmate_groups` | the Moderation board | `mod_status`, moderation note |
| `flatmate_group_applications` | the Applications board | `mod_status`, note - **never `status`** |
| `audit_log` | - | one row per decision |
| notifications | - | the host / applicant is told |

---

## 5. Business rules & logic  *(the meat)*

### 5.1 Two axes that cannot reach each other
A flatmate row carries two independent verdicts, and conflating them is the failure mode this desk
is designed against:

| Axis | Question | Field | Board |
|------|----------|-------|-------|
| Verification | is this host who they say they are? | `flatmate_reviews.status` | Verification |
| Moderation | may the city see this? | `mod_status` | Moderation |

Approving a verification **does not publish the post**, and publishing a post **grants no badge**.
Both directions are asserted in `ops/flatmate-moderation.spec.js`, because a desk that quietly
did either would look correct on every screenshot.

A group application adds a third column that is not this desk's at all: `status`
(`pending`/`accepted`/`declined`) belongs to the flat's owner, who answers it from their dashboard.
The desk writes `mod_status` and leaves `status` exactly where it found it.

### 5.2 What reaches the Verification board
`FlatmateSupplyService.enqueueReviewIfNeeded` writes a review row when the host claims the
**tenant** tier or when the address is contested. An **owner**-tier post never enqueues one: owning
the flat is the claim the review exists to check, and a self-declared owner is checked by the
ownership flow instead.

Tabs: Pending, **Contested address** (`status=pending&flagged=true`), **Ops-verified**, Rejected,
All. "Contested address" rather than "Flagged", because that is what the flag means - two hosts
claiming the same flat - and a desk reading a generic word invents its own meaning for it.

### 5.3 A rejection must carry a reason
The desk refuses a blank one ("Add a clear reason before rejecting") and
`FlatmateModerationService.decideReview` refuses it again: *"A rejection needs a reason - the host is
always told why."* Two guards for one rule, because the client one is a courtesy and the server one
is the rule. A host told "no" without being told why cannot fix anything, and will simply post again.

### 5.4 The author's mobile number is shown in full
`FlatmateReviewDto` and the queue cards carry the number in full (`hostMobile` on
`FlatmateReviewRow`, `authorMobile` on `FlatmateModerationRow`, `applicantMobile` on the staff
group-application list), as on every back-office surface. The owner's inbox gets no
`applicantMobile`.

### 5.5 The moderation vocabulary, and the two words that are missing
Kinds: `post` / `room` / `group`, one board at a time - three tables, and a merged board would have
to load every pending row to sort it, or report a `totalElements` that is true of one table and
false of the screen.

States: Pending, **Published** (`approved`), Flagged, Removed, **Live** (self-published).

- `live` means the author published it themselves: owner tier, or a post with no flat. A live row
  that nobody has looked at yet, or that was edited since, shows on Pending as a re-check; the
  re-check strip's **Looks fine** stamps it `approved`.
- `rejected` is **absent deliberately**. The shared vocabulary has it and the server would accept
  it, but on this axis it means exactly what `removed` means, and two words for "not published" is
  an invitation for a desk to use them inconsistently and then be unable to report on either.
- `expired` is set by the expiry sweep, never by the desk. It lists under **Hidden & removed** and
  counts there, and the Decision section offers only Remove (with a note), the one verdict accepted on
  it, so a report takedown sticks; any other verdict is a 409, because only the host's renewal
  revives it, and renewing a removed item leaves it removed.

### 5.6 The free text is never truncated
The Moderation board renders `note` in full, never behind a "show more". It is where a phone number
goes when the contact field will not take one, so a moderator who cannot read all of it cannot do
the job the board exists for.

### 5.7 Publishing is not silent
Every decision writes an audit row (`from`, `modStatus`, `note`). Flag, Remove and Reject **require**
an internal note (400 without one), and so does publishing something that was removed or rejected:
withholding, and undoing a withholding, need an explanation a later moderator can read. A first
Publish does not. The author is told only when the item goes public, or is removed or rejected; the
internal note is never sent to them. Re-stamping the current state is a no-op unless it clears a
re-check (audited as `flatmate.recheck.clear`). The expiry clock restarts only when an item goes public.

---

## 6. Maker-checker / approval
The host is the maker (they post, they declare a tier, they upload an agreement); this desk is the
checker. There is no second checker - a single staffer's decision is final, which is acceptable
because moderation is reversible from the same board and audited.

- **No self-checking (403).** A staffer cannot moderate, desk-edit or decide the badge of an item they
  authored or whose group they belong to, nor moderate a group application they made, one from a
  group they belong to, or one to a flat they own. Staff accounts cannot join groups, send interest or
  split a flat, so they never become a party. A staffer with a second, unlinked consumer account is a
  residual risk this rule cannot see.
- **A decided badge review is terminal.** The same verdict again is an idempotent 200; a different one
  is a 409. It reopens only when the host edits the post or the trust reconciler re-queues it.
- **A taken-down application is frozen.** Once the desk hides or removes it, the owner's accept or
  decline is a 409. The verdict and the owner's decision serialise on the listing lock, so neither
  overwrites the other; a badge verdict, renewal and the expiry sweep likewise lock the post first.
  Restoring a removed application the owner had accepted is a 409 once another group holds the flat,
  or when its own group is no longer live.
- **Owner consent never republishes.** Recording an owner's OTP consent writes only the consent flags,
  so a takedown or a decided review that lands meanwhile is kept.

---

## 7. State machine

```
verification:  pending --approve--> approved (badge granted)
               pending --reject(reason)--> rejected

verification:  approved/rejected --other verdict--> 409 (terminal)

moderation:    pending --Publish--> approved (public)
               pending --Flag(note)--> flagged
               pending --Remove(note)--> removed
               live --Looks fine--> approved   (re-check: new post / edited)
               live --Flag/Remove(note)--> flagged/removed
               removed/rejected --Publish(note)--> approved
               expired --Remove(note)--> removed   (renew keeps it removed)
               expired --other--> 409 (host renews)

application:   mod_status live --Clear/Flag(note)/Remove(note)--> approved/flagged/removed
               status pending --(owner, elsewhere)--> accepted/declined
```

---

## 8. Edge cases, validation & error states
- **The API is unreachable:** the page renders a panel saying it needs the live API, rather than an
  empty queue. An empty queue and a disconnected queue look identical, and one of them means "the
  backlog is clear".
- **A decided row leaves its tab.** Every assertion about the *result* of a decision has to follow
  the row to where it went - that is queue behaviour, not a bug.
- **`Badge` is a translation layer.** `pending` renders as **Under Review**. Consult
  `components/ui/Badge.jsx` before asserting a status word anywhere near this desk.
- **Size:** each tab reads up to 100 rows per source (the API's page ceiling). Past that the count
  line says the list is partial, rather than showing a short queue as if it were complete. Any
  source failing fails the tab: a queue missing a third of its rows would read as "nothing to do".

---

## 9. Known gaps & debt
| Gap | Why it is here | Cost of leaving it |
|-----|----------------|--------------------|
| Agreement documents are base64 in a JSONB column | ruling: it works, and redesigning document storage was not this wave's job | row size, and no CDN path |
| Documents over ~3 MB cannot be previewed | the inline cap | the desk sees "Agreement on file" and must ask |
| `rejected` unavailable on the moderation axis | see 5.5 | none intended; recorded so it reads as a choice |

---

## 10. Contract note - four routes that are not in the OpenAPI contract

The contract described `GET`/`PATCH /admin/group-applications`: an admin board over a table nothing
could write to. Wave 2c part 3 built the missing write path, which meant adding four routes the
contract does not name:

| Route | Why |
|-------|-----|
| `POST /flatmates/groups/{id}/apply` | hangs off the **group**, because the group is what is being committed |
| `GET /me/group-applications` | the owner's inbox |
| `PATCH /me/group-applications/{id}` | the owner's verdict, deliberately a different path from the admin one so no request is ambiguous about which column it writes |
| `GET /me/flatmate-groups` | the caller's own groups as a `FlatmateGroupCard` (seats, moderation state, member count), which carries no host identity, so "is this group mine?" has an answer in live mode |

This is an **intentional extension**, not drift.

---

## 11. Test coverage
- `e2e/tests/ops/flatmate-moderation.spec.js` - 9 tests: the three-tab layout, every decision taken
  through the popup, plus the retired `/admin/flatmates` route, live.
- `e2e/tests/ops/flatmate-review.spec.js` - 1 test: the offline panel, which is the only claim that
  has to be checked with the API unreachable. The three consumer-facing verification cues moved to
  `e2e/tests/consumer/flatmates/review-status.spec.js`, where each label is earned through a
  real Ops decision rather than seeded.
- `e2e/tests/consumer/flatmates/group-apply.spec.js` - 2 tests, the consumer loop that fills
  the third board.
- `backend/src/test/java/com/draazy/api/engagement/flatmate/FlatmateApplicationEndpointsTest.java` -
  13 tests over the apply / inbox / decide rules.
