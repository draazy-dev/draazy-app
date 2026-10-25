# Decisions

Open questions and the standing rulings that stop them being asked again. One row each.
A decision that was simply built leaves no row: git holds it. Link a number from `todo.md`; never restate it.

## Open

Nothing.

## Standing rulings

| # | Question | Ruling |
|---|----------|--------|
| 41 | Static analysis | Sonar only; add a second SAST (CodeQL/Checkmarx) only if Sonar misses a real finding |
| 45 | May the Enquiries desk write `contact_requests.status`? | No: it is the owner's consent; "Responded" is a note |
| 264 | Pre-leased rent and lease expiry public? | Yes, no gate (asset terms, optional) |
| 266 | Caching layer | None until a profiler asks for one |
| 267 | Ctrl+K palette `rawDb` import | Keep; every data category is gated on `isHttpDomain` |
| 273 | "Posted by Draazy" badge | No public badge; the concierge desk posts on the owner's behalf |
| 274 | "Owner KYC Pending" tile | Stays dropped; nobody works that queue |
| 275 | Home type default | `Flat` |
| 276 | More than one floor-plan photo | First wins, not enforced |
| 283 | `service_request_identities` encryption | AES-256-GCM converter with an env key now; KMS envelope is the target |
| 294 | Presence `lastSeenAt` | Shared by default; opt-out in settings |
| 297 | Light mode | Keep |
| 299 | Admin queue for RA/legal/valuation | Use `/admin/services` |
| 300 | RA place of execution, proof PDFs, presenter/challan party | Left to ops on the IGR portal |
| 301 | RA identity numbers | Keep them encrypted; keep `IDENTITY_ENCRYPTION_KEY` |
| 302 | Managers and `desk:*` narrowing | Managers see every desk |
| 304 | "Clear title" search facet | Dropped |
| 305 | PG as a listing type | Dropped; flatmates covers shared living |
| 306 | RA SLA | Wall-clock, no pause, no notification |
| 307 | Gram Panchayat list | Seed edits through `R__` |
| 308 | Police verification needs the tenant's ID | Tenant supplies it |
| 310 | Owner-consent OTP does not name the flat | Moderator corroboration only |
| 313 | Ownership evidence at approval | Not demanded |
| 314 | Two approve routes | Stay separate; the record says which ran |
| 315 | Resubmission cooldown | None |
| 316 | Production test accounts | Don't build; test on sandbox |
| 317 | Hand-granted Verified badge outside KYC Review | Allowed; audited |
| 318 | Removed flatmate-group members | Lose the chat history |
| 319 | Flatmate group applications | Go live without pre-moderation |
| 321 | Visit no-show | Owner-only "Didn't come" on a confirmed visit after its day; no penalty, visitor disputes go to Support |
| 322 | Limit visit hours to daytime? | No; the owner confirms or reschedules every slot |
| 323 | Payment disputes | No in-app dispute form: refund request on Plan & Billing or a Support ticket; a Cashfree chargeback freezes only that order |
| 324 | One checkout TTL for every payment kind | Yes, 20 minutes for passes, packs, rent, services and co-fill (15 is Cashfree's floor and fails every order) |
| 325 | Backfill pre-deploy 45-min Cashfree orders and old `9xxxxxxxxx` erasure pseudonyms? | No: no production data exists before launch |
| 326 | Pause on flatmate rooms | Not offered; rooms expire, and can be edited or deleted |
| 327 | Send the ID number at identity submit | No; appeals go through `POST /me/verification/identity/appeal` |
| 328 | Access token in web storage | Accepted: refresh token is HttpOnly and the strict CSP is the control |
| 329 | API fuzzer (Schemathesis) | No; `BoundaryValidationTest` covers it |
| 330 | Second staff check on approvals (identity QA, property overrides, held drafts, appeals)? | No: one staff decision is final. Refunds keep two-person approval; staff still can't act on their own listing, case, appeal or uploaded registered copy |
| 331 | Tenant-hosted flatmate Verified home | Rent agreement or light bill naming the owner, plus owner OTP/WhatsApp consent in both cases |
| 332 | Verified home needs the host ID verified first? | Yes; posting still needs neither |
| 333 | Owner renting a spare room without a Draazy listing | Lists the flat as a property and earns its Verified-owner badge; the room inherits it |
| 334 | Flatmate publish checklist | Rooms and flat-holding groups need the 3 property ticks before Publish; seeker and hunting-group posts stay live-first, reviewed after |
| 335 | Flatmate Needs info | Yes: reason code, post stays pending, host replies in the Support thread or edits |
