---
title: Ownership and badges
slug: ownership-and-badges
category: ops-playbook
audience: staff
access: staff
order: 4
updated: 2026-11-06
summary: Internal procedure for ownership evidence, the Verified property badge and manual KYC done badges.
tags: [ops, ownership, badges, internal]
modules: [properties, users]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **Badge requests** tab in Properties: "due soon" (amber) from 24 h, "overdue" (rose) from 72 h, oldest first.
- **Owner is seeking the Verified property badge** banner: the request waits for your answer.
- **Current** or **Expired** chip on each evidence row: only current proof counts.

**Work on**

- Answer every badge request: **Grant ownership verification**, or **Decline badge request** with a reason.
- Open every evidence row and compare the dates and address with the listing before you grant.
- Withdraw a granted badge when its evidence becomes unsafe.

## Desks and access

Draazy shows two badges only. **Verified property** is the ownership badge, granted here. **KYC done** is the person badge, earned through [Identity review](/help/a/identity-review) or granted by hand in Users. Neither certifies legal title.

Review ownership evidence inside **Admin → Properties** (`/admin/properties`) in the listing review modal; staff open it under `/staff/properties`. You need the **Property verification** function (`properties:verify`). Use the **Ownership verification** section to read and record evidence, then grant, or withdraw a grant. Decline a badge request from the banner. The verdict strip shows **Ownership verified** with the date it is valid until, or the missing evidence that blocks it.

Hand-granted **KYC done** badges live in **Admin → Users** (`/admin/users`). A manager or admin with `users:write` uses **Grant Verified badge** or **Remove Verified badge** with a reason, and it takes effect at once. You cannot badge yourself. Every grant and removal is audited.

## Ownership request states

| State | Staff action | User-visible effect |
| --- | --- | --- |
| No request | Request more evidence or leave untouched | No ownership badge |
| Requested | Inspect evidence and decide | Listing can still be reviewed separately |
| Granted | **Grant ownership verification** | Ownership badge appears on eligible reads |
| Declined | **Decline badge request** → **Decline request** | No ownership badge; owner sees the reason |
| Withdrawn | **Withdraw ownership verification** (reason required) | Badge is removed; evidence rows remain |

Ownership review is separate from listing publication. Recording evidence does not grant a badge; staff must click **Grant ownership verification**. The button stays disabled while evidence is missing (**Record the missing evidence first.**) and while the owner has not got **KYC done** (**Owner ID pending: verify the owner's ID first.**). Verify the owner in Identity review, then come back.

A granted badge lapses when the documents expire, until the owner submits current ones. It is also removed if the listing's address, society or electricity meter number is changed later, until the listing is re-checked.

## Where badge requests come from

The owner uploads a proof to the listing's **Document Vault** and taps **Request Verified badge**. An upload alone queues nothing. The request lands in the **Badge requests** tab of `/admin/properties`, and the review modal opens with the banner **Owner is seeking the Verified property badge**.

Answer every request one way or the other: grant in the badge section, or use **Decline badge request** on the banner. A decline needs a reason of up to 300 characters, which the owner sees, and leaves the listing's status untouched, so it works on a live, paused or pending listing.

## Evidence rules

| Listing | Required ownership evidence |
| --- | --- |
| Rent | Address proof or title proof |
| Sale | Title proof |

Accepted title proofs are Index II, share certificate, Satbara / 7-12 extract, 8A extract and property card. Accepted address proofs are tax receipt and electricity bill. Power of attorney proves authority only when the subject name is present. Site photos and sale deed are supporting evidence, not enough alone.

Aadhaar and PAN are retired identity evidence for this desk. Do not accept them as ownership proof.

A RERA number is shared by the owner: check it on MahaRERA with the review modal's **Open MahaRERA search** link and tick the RERA check. Draazy does not verify societies, so a society name or share certificate is evidence about the flat, not a society approval.

## Date and document checks

1. Open every evidence row before deciding.
2. Confirm the vault category matches the evidence type.
3. Confirm `issuedOn` is present, not in the future and not later than the uploaded file.
4. Apply the validity window: land records, property card and electricity bill are valid for 90 days; site photos are valid for 180 days; tax receipt is valid until the financial year end.
5. Compare the property address, society, flat or survey identifiers against the listing.
6. Confirm the reviewer is not the listing owner.

## Ownership decisions

Use **Grant ownership verification** when required evidence is valid and matches the listing. Use **Decline request** when evidence is missing, unreadable, mismatched or category-invalid. Use **Withdraw ownership verification** when a granted badge becomes unsafe.

Do not use listing approval as a shortcut for ownership proof. A listing can be live without ownership verification.

## Manual KYC done badges

A manager or admin grants or removes a manual **KYC done** badge in one step:

| Rule | Requirement |
| --- | --- |
| Who | A manager or admin with `users:write` |
| Reason | Required, 10 to 300 characters |
| Self | You cannot badge your own account |
| Already verified | A second grant is refused |

Use this panel only for hand-granted badges. If the badge was earned through KYC, revoke through **Identity review**.

## Never do in ownership and badges

- Do not grant ownership from Aadhaar, PAN or a selfie.
- Do not grant ownership when only supporting evidence is present.
- Do not grant a manual badge to your own account.
- Do not withdraw an identity-earned badge from the user badge panel.
- Do not delete evidence rows to hide a bad decision; withdraw or decline instead.

## Related

- [Verification SLAs](/help/a/verification-sla)
- [Identity review](/help/a/identity-review)
- [Chats, tickets and escalation](/help/a/ticket-escalation)
