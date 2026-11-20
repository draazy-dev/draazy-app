---
title: Society moderation
slug: society-moderation
category: ops-playbook
audience: staff
access: staff
order: 6
updated: 2026-11-06
summary: Internal procedure for duplicate society merges and society detail edits.
tags: [ops, societies, moderation, internal]
modules: [places]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **Duplicates** tab count: new societies waiting for a check.
- **Similar to** row: **Could not check** means search by hand before merging; **No obvious match** means nothing similar was found.
- **Merged duplicates** list at the bottom of Duplicates: recent merges you may need to undo.

**Work on**

- Go through **Duplicates** and **Merge** only true duplicates of an existing society.
- **Undo** a merge that was wrong.
- In **Society details**, press **Edit** only when a society's details are wrong.

## Desk and access

Use **Places** (`/admin/places`), tabs **Duplicates** and **Society details**. You need the **Societies** function (`societies:read` to view, `societies:write` for merges and detail edits); staff open it under `/staff/places`. The old `/admin/societies` link redirects there. The **Areas** tab on the same page belongs to the [Localities desk](/help/a/localities-desk) and needs its own function.

A society is identified by its Google Maps place. Owners and seekers can only pick a society from Google Maps suggestions, so every society row maps to one real place. New societies are accepted only inside the districts served (see [Settings and integrations](/help/a/settings-and-integrations)).

## Console tabs

| Tab | Use it for | Primary actions |
| --- | --- | --- |
| **Duplicates** | Societies added from Google Maps picks, with duplicate hints. Search by society or locality | **Merge**, **Undo** |
| **Society details** | Search by society or builder and edit data Google does not have: **Registered**, **Conveyance done**, **Maintenance (₹/sqft)** and an **Admin note** | **Edit**, then **Save** |

If a queue fails to load, a red banner says so with **Retry**. That is missing data, not an empty queue.

## Merge decisions

Use **Merge** when a candidate duplicates an existing canonical society. The merge window searches target societies ("Search societies…") and confirms with **Merge**. Its listings, follows and reviews then read on the society you merged into; nothing is deleted.

Use **Undo** only when the merged-away society should exist again. Duplicate hints are advisory; if suggestions are checking, failed or absent, search manually before merging.

**Registered** and **Conveyance done** are staff-entered details, not a Draazy check. Do not describe a society as verified. For RERA, say it is shared by the owner and to check it on MahaRERA.

## Never do in society moderation

- Do not merge a candidate just because names are similar.
- Do not use Society details edits to hide a moderation problem.

## Related

- [Reports and takedowns](/help/a/reports-and-takedowns)
- [Localities desk](/help/a/localities-desk)
- [Support chats](/help/a/support-chats)
