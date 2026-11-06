# Flow: Admin Content & Places

> The editorial + place-registry surface: FAQs (Content page) and the Places page, which holds
> the area registry (Areas tab), the duplicate-society merge queue (Duplicates tab) and the
> society detail editor (Society details tab).
> **Status:** documented from React source and backend controllers - **Primary role(s):** admin and staff (Content, Places modules)

---

## 1. Purpose & user problem
- **Persona:** a content/ops manager who owns what the public site says and which places it knows about.
- **Job-to-be-done:** "Publish and retire FAQs, close areas that should not take new listings, fold
  duplicate societies into the real one, and fill in society facts Google Maps does not have."
- **Why it matters:** areas and societies are the spine of search, filters, SEO and pricing
  ([`../consumer/search-listings.md`](../consumer/search-listings.md)); FAQs are the
  storefront. Bad registry data breaks discovery everywhere.

## 2. Entry points
- **Routes:** `/admin/content` (FAQs only) and `/admin/places` (tabs `?tab=areas`, `?tab=duplicates`,
  `?tab=societies`). Staff reach the same pages under `/staff/content` and `/staff/places`.
- **Legacy redirects:** `/admin/localities` redirects to `/admin/places?tab=areas`; `/admin/societies`
  redirects to `/admin/places?tab=duplicates`.
- **Tab selection:** `useTabParam` reads `?tab=`; an unknown or missing value falls back to the first
  tab the operator is allowed to see. Changing tab replaces the history entry.
- **Tiles / triggers:** the staff work dashboard links its Localities card to `?tab=areas` and its
  Societies card to `?tab=duplicates`; the top-bar search lists Areas, Duplicate Societies and Society Details.
- **Source components:**
  - `src/pages/admin/AdminContent.jsx` - FAQ create / edit / archive / restore.
  - `src/pages/admin/AdminPlaces.jsx` - the Places shell: tab bar, queue-load errors, edit and merge modals.
  - `src/pages/admin/AdminLocalities.jsx` - Areas tab.
  - `src/pages/admin/societies/CandidatesTab.jsx` - Duplicates tab.
  - `src/pages/admin/societies/DirectoryTab.jsx` - Society details tab.
  - `src/pages/admin/societies/helpers.jsx` - shared formatters and the `DUPES_FAILED` marker.

## 3. Actors & roles
- **Operator = admin or staff** holding the relevant atoms. Backend controllers require the staff-or-admin
  role plus the atom (`BackOfficePermissions`):

  | Surface | Read | Write |
  |---|---|---|
  | Content | `content:read` | `content:write` |
  | Places - Areas tab | `localities:read` | `localities:write` (Retire / Restore buttons render only with it) |
  | Places - Duplicates and Society details tabs | `societies:read` | `societies:write` (merge, undo, edit) |

- The Places module (`key: 'places'`) is visible with either `localities:read` or `societies:read`.
  `AdminPlaces` filters the tab bar to the tabs whose read atom the operator holds.
- `content.enabled` (admin flag) gates the Content page; Places has no flag.

## 4. Entities touched
- [`faqs`](../../system/data-model.md) - **read / created / updated / archived / restored**.
- [`localities`](../../system/data-model.md) - **read** (all, with live-listing count); **retired / restored** (`archived`).
- [`societies`](../../system/data-model.md) - **read** (directory, candidates, merges); **merged / un-merged**
  (`merged_into`, `merged_at`, `merged_by`); **edited** (`registration`, `conveyance`, `maintenancePerSqft`, `adminNote`).
- [`audit_log`](../../system/data-model.md) - **created** server-side on `content.create|update|archive|restore`,
  `locality.retire|restore`, `society.edit`, `society.merge`, `society.unmerge`.

## 5. Business rules & logic  *(the meat)*

### 5.1 Content - FAQs
FAQs only (`TYPE = 'faqs'`; the backend rejects any other content type). Blank template:
`{ question, answer, category:'general' }`. The page subtitle states that the first 6 FAQs also appear on the Home page.
Active FAQs load on mount; archived ones load on demand via "Show archived".

### 5.2 Content - create / edit
- **Save (new):** `createContent('faqs', body)` -> `POST /admin/content/faqs`; the returned row is appended.
- **Save (edit):** `updateContent` -> `PATCH /admin/content/faqs/{id}`; the returned row replaces the old one.
- **Validation:** question and answer are required (toast "Enter the question." / "Enter the answer."); category is free text.

### 5.3 Content - archive / restore (soft delete)
- **Archive:** `window.confirm("Archive this FAQ? It will be hidden but preserved.")` ->
  `POST /admin/content/faqs/{id}/archive`; the row moves to the dimmed "Archived" section.
- **Restore:** confirm -> `POST /admin/content/faqs/{id}/restore`.
- No hard delete. No note is collected; the actor and action land in the server audit log.
- Review moderation is not on this page (see [`trust-safety-reports.md`](./trust-safety-reports.md)).

### 5.4 Places - shell
`AdminPlaces` renders the `Places` header, a `QueueTabs` bar and the active tab.
- **Tabs:** `Areas` (`localities:read`), `Duplicates` (`societies:read`), `Society details` (`societies:read`).
  Only tabs the operator can read are shown.
- **Counts:** the Duplicates badge is `candidates` from `GET /admin/societies/summary` (fetched only with
  `societies:read`, refetched after each merge/undo/edit); the Society details badge is the directory total once loaded.
  The Areas tab has no badge.
- **Queue errors:** a failed candidates or merges load (`ApiError` / `NetworkError`) is collected and shown as a red
  alert with Retry, so a failed queue is never shown as an empty one.

### 5.5 Places - Areas tab (`AdminLocalities`)
- **Source:** `GET /admin/localities` (`listAdminLocalities`) returns every locality with `slug`, `name`, `lat`, `lng`,
  `archived` and `liveListings`. Areas appear when someone picks them from Google Maps suggestions.
- **List:** columns Locality (name + slug), Pin (lat, lng to 4 dp), Live listings, Status (`Active` / `Retired`),
  and Action when the operator holds `localities:write`. Mobile renders cards.
- **Filters:** search by name or slug; status chips All / Active / Retired with counts; client-side paging of 20.
- **Retire:** confirm modal ("will stop accepting new listings"; existing live listings and the area page stay) ->
  `POST /admin/localities/{slug}/retire`; audit `locality.retire`.
- **Restore:** confirm modal ("open for new listings again") -> `POST /admin/localities/{slug}/restore`; audit `locality.restore`.
- Retire/restore are no-ops on the server when the area is already in the target state.
- Locality editorial/SEO content (rates, demand, focus) is not edited here.

### 5.6 Places - Duplicates tab (`CandidatesTab`)
- **Candidate queue:** `GET /admin/society-candidates?q&page&size` (10 per page, search debounced 250 ms). A candidate is a
  society with `source = 'community'` that is not archived and not merged into another. Rows are newest first
  and show the name, a `Community` chip, a source chip (`Searcher demand` for `mintOrigin = 'demand'`,
  `From a listing` for `'listing'`), the locality, and the mint date.
- **Similar to:** after each page loads, `GET /admin/society-candidates/duplicates?slugs=...` returns up to 6 suggestions per
  candidate; the first 3 render as chips ("Checking...", "No obvious match" or "Could not check" while loading, empty or failed).
  Clicking a chip opens the merge modal pre-targeted at that society.
- **Merge:** the Merge button opens a modal with a society search (`useSocietySearch`, scoped to the candidate's locality,
  excluding the candidate itself, 8 results). `POST /admin/society-merges { from, into }` folds the candidate into the
  chosen society: its listings, follows and reviews read on the survivor; nothing is deleted. Confirm requires a target.
  Audit `society.merge`.
- **Merged duplicates panel:** `GET /admin/society-merges` lists each merged society -> survivor with the merge date and an
  **Undo** button (`DELETE /admin/society-merges/{slug}`, audit `society.unmerge`), after which the society stands on its own.
- A candidate leaves the queue only by being merged; there is no approve or reject action.
- Per-row buttons are disabled while that society's action is in flight (`withDeciding`).

### 5.7 Places - Society details tab (`DirectoryTab`)
- **Directory:** `GET /admin/societies?q&page&size` (20 per page, search debounced 250 ms) lists society (name, builder, year),
  locality, and maintenance (Rs/sqft), with an Edit button per row. A load failure shows "The directory could not be loaded.
  This is not an empty catalogue - nothing was read."
- **Edit:** `GET /admin/societies/{slug}` loads the current record, then the Edit society modal exposes
  `Registered` (checkbox), `Conveyance done` (checkbox), `Maintenance (Rs/sqft)` and `Admin note`.
  Save sends `PATCH /admin/societies/{slug}` with `{ registration, conveyance, maintenancePerSqft, adminNote }`
  (audit `society.edit`). These facts show on the society page and in price insights.
- **Validation (server):** `maintenancePerSqft` must be 0 to 100 (rupees per sq ft, not the monthly bill).

### 5.8 What lives server-side
- All Places and Content state is held by the backend; the browser keeps only UI state.
- Role and atom checks are enforced by `@PreAuthorize` on each controller; the UI hides buttons as a convenience.
- Merges are conditional updates on `merged_into`; a merge of an already-merged society, or an undo of an unmerged one, is rejected.

## 6. Maker-checker / approval
- **Content:** single-actor publish/archive; no separate proposer and approver.
- **Areas:** areas are minted automatically from Google Maps picks; the admin step is a reversible Retire/Restore, not an approval.
- **Duplicates:** the community mint is the proposal; the admin Merge (reversible via Undo) is the checker step.
  Merge and edit require `societies:write`, so a read-only operator can view the queue but not act.
  See the shared pattern in [`../../system/cross-cutting.md`](../../system/cross-cutting.md) section 2.

## 7. State machine
- **FAQ:** `active <-> archived`. No hard delete.
- **Area:** `Active <-> Retired` (retired areas keep their live listings and page).
- **Society (community):** `candidate -> merged into a canonical society -> candidate` (Undo).

## 8. Edge cases, validation & error states
- **Loading:** Content shows a spinner until flags and the live FAQ list load; Areas shows "Loading localities..."; the
  directory shows "Loading the directory...".
- **Module gating:** `content.enabled` off -> "Content module is disabled." with an "Enable in Settings" link.
- **Tab gating:** a tab without the read atom is not rendered; a `?tab=` value that is not allowed falls back to the first allowed tab.
- **Confirmations:** FAQ archive/restore use `window.confirm`; area retire/restore and society merge use modals.
- **Merge errors:** a failed merge or undo surfaces the server message as an error toast
  ("Could not merge those two societies." / "Could not undo that merge." as fallbacks); picking no target shows "Pick a society to merge into."
- **Duplicate checks:** a failed duplicate lookup renders "Could not check" per candidate rather than "No obvious match".
- **Empty states:** "No FAQs yet.", "No localities.", "No localities match these filters.",
  "No community candidates awaiting review. Auto-minted societies land here.", "No societies.", "No societies match that search."
- **Concurrency:** the server rejects a stale merge/undo; other edits are last write wins.
