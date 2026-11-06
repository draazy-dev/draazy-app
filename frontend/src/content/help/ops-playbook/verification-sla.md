---
title: Verification SLAs
slug: verification-sla
category: ops-playbook
audience: staff
access: staff
order: 1
updated: 2026-11-06
summary: Internal queue rules for listing verification, live re-checks, duplicates and owner follow-up.
tags: [ops, sla, verification, internal]
modules: [properties]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **To verify** tab, newest first — amber at 24 h ("due soon"), rose at 48 h ("overdue").
- **Re-checks** and **Badge requests** tabs — amber at 24 h, rose at 72 h.
- **Flagged** tab count — every flagged listing is out of search until you clear or archive it.
- **Duplicates** tab count — clusters still waiting for a decision.
- **Follow-up** tab count — live listings the owner has not confirmed for over two weeks. It has no amber or rose.
- Your bell alerts (also emailed to staff): **New …**, **Waiting …** and **Escalated: …** for the queues in "Queue alerts and escalations" below.
- Every queue shows newest first, and each tile shows when the listing was created or last updated.

**Work on**

- Clear the rose rows in **To verify** first; they sit at the end of the list. Use the **Awaiting owner** chip to separate staff-posted listings that only need an owner nudge.
- Decide every row in **Re-checks**: **Looks fine**, or take the listing down.
- Grant or decline every request in **Badge requests**.
- Decide each cluster in **Duplicates** before approving any member.
- On **Follow-up**, send the WhatsApp reminder (bell icon) and record it.

## Desk and access

Use **Admin → Properties** (`/admin/properties`) for listing verification. Staff open it under `/staff/properties`. Access comes from functions: **Property verification** (`properties:verify`) decides verification cases; **Listing moderation** (`properties:moderate`) flags, archives, restores and merges duplicates. Either one lets you edit a listing during review.

Use the owner follow-up buttons only with the **Post on behalf** function (`postOnBehalf:write`); those routes can prepare claim-link and WhatsApp outreach to an owner.

## Queue tabs and targets

| Tab | What enters | Target shown in the desk |
| --- | --- | --- |
| **To verify** | Pending listings ready for staff review; staff-posted listings waiting on the owner sit here under the **Awaiting owner** progress chip | Warn at 24 hours; breach at 48 hours |
| **Re-checks** | Live listings with a `recheckRequestedAt` timestamp | Warn at 24 hours; breach at 72 hours |
| **Badge requests** | Listings asking for ownership verification | Warn at 24 hours; breach at 72 hours |
| **Follow-up** | Live listings the owner has not confirmed as still available for over two weeks | No breach colour; the row is a follow-up task |
| **Flagged** | Listings with a staff flag | Work by risk, not by SLA colour |
| **Duplicates** | Server-built duplicate clusters | Decide each cluster before approving any member |
| **All listings** | Full moderation view, including archived rows when filtered | Use only to find or restore a known listing |

The SLA panel is green at 90% or better, amber from 75% to 89%, and rose below 75%.

## Queue alerts and escalations

You do not have to watch the tabs all day. A sweep runs every 15 minutes and sends a bell alert for each queue below. On a staff account the same alert is also emailed to the address on the account (managers and admins get the bell only).

| Alert | When | Goes to |
| --- | --- | --- |
| **New …** (arrival) | A new item arrives unassigned, in the first hour | Staff holding the function |
| **Waiting 24h+** (reminder) | The item has waited the reminder time | The assignee, or the staff holding the function |
| **Escalated: … untouched 36h+** | The item has waited the escalation time | Managers (admins if there are no managers) |

| Queue | Reminder | Escalation | Function that gets it |
| --- | --- | --- | --- |
| Listing to review | 24h | 36h | Listing moderation |
| Listing re-check | 24h | 36h | Listing moderation |
| Owner reply to answer | 48h | 72h | Property verification |
| Verified-badge request | 48h | 72h | Property verification |
| ID check, identity appeal | 48h | 72h | KYC review |
| Flatmate check | 48h | 72h | Flatmates |
| Flatmate post to moderate | 24h | 48h | Flatmates |
| Support chat waiting on us | 24h | 48h | Support |
| Abuse report | 24h | 48h | Reports |
| Refund request | 48h | 72h | Refunds |
| Unassigned service request | 4h | 8h | That service desk |
| Rent agreement | Past its stage deadline | 1.5 times the stage deadline | Rent Agreement desk |
| Data-erasure request | 7 days | 20 days | Admins |
| Customer draft decision, community society | Arrival alert only | None | The desk or Societies |

An alert clears itself when the item is decided. Fix the queue, not the alert. A rent agreement that waits on the tenant's payment invite is shown as waiting, not late. Real alert emails need email delivery switched on in [Settings and integrations](/help/a/settings-and-integrations).

The tab colours above (24h/48h, 24h/72h) are the desk's own colours; the bell alerts use the times in this table. Suspended accounts stop receiving alerts.

## Listing states

| State | Staff meaning | Buyer-visible effect |
| --- | --- | --- |
| `pending` | Waiting, in review, or awaiting owner info | Hidden from public search |
| `approved` | Published | Visible unless archived |
| `needs_info` review | Staff asked for a correction | Listing stays `pending`; owner sees the reason |
| `rejected` | Refusal | Hidden; the owner's edit returns a fixable rejection to `pending`, **Reopen for review** returns any rejection |
| `flagged` | Unsafe or disputed | Hidden until the flag is cleared or archived |
| `archived` | Soft-deleted | Hidden; restore returns to `pending` |

## Review procedure

1. Open the listing from **To verify** or **Re-checks**.
2. Check the photos, duplicate result, details, address and locality.
3. Tick every checklist item before approving. The **Approve** button stays locked until the checklist is complete, and the server rejects incomplete approvals.
4. Read fraud signals before deciding. Hard signals stay visible as warnings; weigh them, then decide yourself.
5. Add an internal note when the decision depends on evidence not visible in the fields.
6. Decide with **Approve**, **Needs info**, or **Reject**.

## Decision rules

### Approve listing

Use **Approve** only when the checklist is complete, you have weighed any duplicate or broker signal, and the address and locality are believable. One approval is final; you cannot approve a listing you posted or own.

### Send needs info

Use **Needs info** for fixable gaps. Choose a reason code. If the code is **other**, write the note. Owner reply or edit resubmits the listing and clears the waiting flag.

The hourly sweep sends owner reminders after 3 days and 7 days. If there is no reply or edit after 14 days, the listing is soft-archived with `needs_info_timeout`.

### Reject listing

A reason code is required. Five reasons are fixable: photos not real, wrong details, locality unclear, document unreadable and name mismatch. The owner is told to edit the listing and resubmit it, and the edit sends it back to `pending` for a fresh decision. The other reasons (duplicate, broker, RERA, other) are final: the owner cannot edit, and an owner reply does not reopen the listing. Use **Reopen for review** when a finally rejected case must re-enter review.

### Work re-checks while live

Use **Approve edits** or the re-check pass action when the live listing still matches policy. Use **Reject listing** from the re-check modal when the live listing must come down; rejecting removes it from public search.

### Resolve duplicate clusters

Use **Keep this, archive the rest** only when the cluster really points to the same property. Use **Not a duplicate** for false positives. Treat a duplicate-scan failure or truncation as unknown, not clean.

## Never do in listing verification

- Do not approve with an unticked checklist.
- Do not approve a listing you posted or own.
- Do not use **Reject** for a fixable photo, address or document gap.
- Do not publish a staff-posted listing before the owner confirms it.
- Do not treat **Follow-up** as a breach queue; send the owner nudge and record the outreach.

## Escalation path

Escalate suspected organised fraud, legal or police references, minors, media contact, or repeated attempts to reopen rejected listings up the ladder in [Chats, tickets and escalation](/help/a/ticket-escalation), by phone for a P0. Record the listing id, reason code, signals and action already taken.

## Related

- [Chats, tickets and escalation](/help/a/ticket-escalation)
- [Support chats](/help/a/support-chats)
- [Ownership and badges](/help/a/ownership-and-badges)
- [Reports and takedowns](/help/a/reports-and-takedowns)
