---
title: Society moderation
slug: society-moderation
category: ops-playbook
audience: staff
access: staff
order: 6
updated: 2026-10-12
summary: Internal procedure for duplicate society merges and society detail edits.
tags: [ops, societies, moderation, internal]
modules: [places]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **Duplicates** tab count — new societies waiting for a check.
- **Similar to** column — **Could not check** means search by hand before merging.
- **Merged duplicates** list at the bottom of Duplicates — recent merges you may need to undo.

**Work on**

- Go through **Duplicates** and **Merge** only true duplicates of an existing society.
- **Undo** a merge that was wrong.
- In **Society details**, fix a profile only when its details are wrong.

## Desk and access

Use **Places** (`/admin/places`), tabs **Duplicates** and **Society details**. You need the **Societies** function (`societies:read` to view, `societies:write` for merges and detail edits); staff open it under `/staff/places`. The old `/admin/societies` link redirects there.

A society is identified by its Google Maps place. Owners and seekers can only pick a society from Google Maps suggestions, so every society row maps to one real place.

## Console tabs

| Tab | Use it for | Primary actions |
| --- | --- | --- |
| **Duplicates** | Societies added from Google Maps picks, with duplicate hints | **Merge**, **Undo** |
| **Society details** | Search and edit registration, conveyance and maintenance — data Google does not have | Edit profile fields |

If a tab shows empty because loading failed, reload before deciding that the queue is clear.

## Merge decisions

Use **Merge** when a candidate duplicates an existing canonical society. The merge modal searches target societies and confirms with **Merge**.

Use **Undo** only when the merged-away society should exist again. Duplicate hints are advisory; if suggestions are checking, failed or absent, search manually before merging.

## Never do in society moderation

- Do not merge a candidate just because names are similar.
- Do not use Society details edits to hide a moderation problem.

## Related

- [Reports and takedowns](/help/a/reports-and-takedowns)
- [Ticket handling and escalation](/help/a/ticket-escalation)
