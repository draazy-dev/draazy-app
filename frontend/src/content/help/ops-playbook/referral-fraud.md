---
title: Referral fraud review
slug: referral-fraud
category: ops-playbook
audience: staff
access: staff
order: 13
updated: 2026-10-12
summary: How the automatic referral checks work and when staff audit, override or claw back a reward.
tags: [ops, referrals, fraud, rewards, internal]
modules: [referrals]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## What the desk is

Referral rewards are decided automatically. The desk is an audit and override view: nobody works a queue, and referrals are not part of anyone's daily work list. Open it to answer a support appeal, check a pattern, or reverse a reward.

## Daily checklist

**Monitor**

- The **Held** tab only when a referrer writes in; the sweep releases or rejects held rows by itself.
- **High risk** rows for repeat devices, networks or fast redemptions, when investigating.

**Work on**

- Appeals from a referrer whose reward was auto-rejected: read the **Auto reason** and answer from it. To reverse a rejection, use **Appeal: approve** on the row and give a reason.
- **Clawback** only on a **Rewarded** or **Qualified** row where the granted reward must be reversed.

## Desk and access

Use **Referrals** in the sidebar (`/admin/referrals`; staff open it under `/staff/referrals`). You need the **Referrals** function (`referrals:read` to view, `referrals:write` to decide).

The desk shows both mobiles in full but no raw device or IP evidence; work from the server-computed signals and the decision buttons.

## How a referral is decided

1. **At redemption** the server refuses outright: the referrer's own code, an account that was already referred, a sign-up outside the allowed window, an account that already has a listing or contact request, the same first-party device id as the referrer, or referral rewards being switched off. Refused codes never become desk rows, and the person sees one generic message.
2. **At qualification** the server scores risk from the shared network, shared browser, redemption velocity and the referrer's account age: low, medium or high.
3. **Low** is granted immediately. **Medium** is `held` for the hold period, then released or rejected by the sweep. **High** is rejected automatically and the referrer is told to contact support.
4. Monthly and yearly caps apply; overflow is rejected with the auto reason **Cap reached** and does not queue.
5. A referee found to be abusive is suspended within the clawback window, which automatically reverses the reward and takes the qualifying listing down.

All limits, windows and reward sizes are set in **Settings → Fees → Referrals**.

## Tabs and counts

Rows are paged 20 at a time, with server-side counts on each tab and a search box (referrer, referred or id).

| Tab | What it shows |
| --- | --- |
| **Held** | `held` referrals, with the date the hold ends |
| **Pending** | `pending` and `qualified` referrals |
| **High risk** | Any referral with `risk = high` |
| **Rewarded** | `rewarded` referrals |
| **Refused** | `rejected` or `clawed-back` referrals |
| **All** | Every status |

## Status states

| Status | Meaning | Available actions |
| --- | --- | --- |
| `pending` | Redeemed; the qualifying event has not happened yet | Approve (override), or Reject |
| `held` | Qualified but waiting out the hold | Approve (override), or Reject |
| `qualified` | Qualified and granted | Approve, Reject, or Clawback |
| `rewarded` | Reward released | Clawback |
| `rejected` | Refused before release, with an auto reason when automatic | Appeal: approve (reason required) |
| `clawed-back` | Reward was released and reversed | None |

Keep `rejected` and `clawed-back` separate. One means never paid; the other means paid and recovered.

## Auto reasons

The **Auto reason** on a row is one of: High risk, Needs review (one risk signal, so the row is held), Cap reached, Referee suspended, Listing taken down, Verification revoked, Listing not live, Self-dealing (the referrer approved their own referee's contact).

## Reward rules

The reward label is server-composed, for example **+15 owner contacts** or **1 free rent agreement**. `rewardAmount` counts contacts or agreements, not rupees.

A clawback removes the derived entitlement. An agreement already delivered stays with the user. Rows from before tracks existed have no track and earn contacts only.

## What never to do

- Never treat **High risk** as a terminal status
- Never format `rewardAmount` as money
- Never reject a paid reward when the correct action is **Clawback**
- Never export referral CSV outside the fraud investigation
- Never promise a reward release outside the in-app referral status
- Never tell a user which check refused their code

## Related

- [Identity review](/help/a/identity-review)
- [Ownership and badges](/help/a/ownership-and-badges)
