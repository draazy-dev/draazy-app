---
title: Flatmate review
slug: flatmate-review
category: ops-playbook
audience: staff
access: staff
order: 12
updated: 2026-11-06
summary: How staff publish, hide, ask for info, badge and re-check flatmate posts and group applications.
tags: [ops, flatmates, moderation, badges, internal]
modules: [flatmates]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **Pending** tab count, newest first; **Badge requests** tab count, oldest first. On both, each card shows how long it has waited: amber "due soon" from 24 h, rose "overdue" from 48 h.
- Card chips: **Awaiting publish**, **Needs info**, **Host replied (n)**, **Edited since review**, **Live · not yet reviewed**, **Verified property · tenant evidence** / **owner listing** (Badge requests only), **Owner consent missing**, **Contested address**.
- The "first 100 of each list" note: decide some cards to see the rest.
- **Published** tab: new group applications go live on submission.
- The Dashboard **Flatmates** tile counts posts, rooms, groups, applications and re-checks waiting. It does not count badge requests, so open the **Badge requests** tab yourself.

**Work on**

- Clear **Pending**: tick the checks, then **Publish**; or **Needs info**, **Hide for review** or **Remove**.
- Answer **Host replied (n)** cards first: the host has answered your question.
- Read the changed fields on **Edited since review** cards, then **Looks fine** or choose another decision.
- Clear **Badge requests**: **Approve Verified property**, or **Reject Verified property** with a reason. Never approve a tenant badge without **Owner consent**.
- Scan new group applications under **Published**: **Clear** or **Remove**.

## Desk and access

Use **Flatmates** in the sidebar (page title **Flatmate Moderation**, `/admin/flatmates`; staff open it under `/staff/flatmates`). You need the **Flatmates** function (`flatmates:read` to view, `flatmates:write` to decide).

The desk is merged: publication moderation, the case thread and checklist, badge verification, edit re-checks, and group-application moderation all land in one card list. Each card opens a review window with **Overview** and **Details** tabs, a **Decision** panel on the right, and an **Edit details** button.

## Queue tabs and filters

| Tab | Sources |
| --- | --- |
| **Pending** | Pending publication rows, edit re-check rows, and group applications held for review |
| **Badge requests** | Open Verified property claims only, oldest first. A room awaiting publish that also claims the badge shows here and on Pending, one decision each |
| **Published** | `approved` and legacy `live` moderation rows, plus live and cleared applications |
| **Hidden & removed** | `flagged`, `removed`, `rejected` and `expired` moderation rows |

Filter by **All / Room / Group / Seeker post**, by **Posted** date (**All**, **Today**, **7d**, **30d**), and search title, author, or locality. **Clear filters** appears when one is set. Every tab lists newest first except **Badge requests**, which lists oldest first. Each source is capped at 100 rows; when capped, decide visible rows to reveal more.

## Card signals

| Chip | Meaning |
| --- | --- |
| **Awaiting publish** | The post is not public yet |
| **Needs info** | You asked the host a question and are waiting |
| **Host replied (n)** | The host answered or edited; n unread messages |
| **Live · not yet reviewed** | A flatless post (seeker post, or a group still looking for a flat) self-published and still needs a scan |
| **Edited since review** | A public item changed after review |
| **Verified property · tenant evidence / owner listing** | The host is asking for the Verified property badge (Badge requests tab) |
| **Owner consent missing** | Tenant-tier badge cannot be approved yet |
| **Contested address** | Address guardrails flagged the claim |
| **Group application** | This is application moderation, not owner acceptance |

The badge on `pending` renders as **Under Review**. Do not treat that as a rejection.

## Publication decisions

Open the card. The **Decision** panel has an **Internal note** box and these buttons:

| Button | Effect |
| --- | --- |
| **Publish** / **Clear** | Sets moderation public: `approved`. For a room or group that holds a flat, disabled until all three checks are ticked |
| **Needs info** | Pending posts only. Pick a **Reason** first. The post stays pending |
| **Hide for review** | Sets `flagged`; hides the item from public feeds. Needs a note |
| **Remove** | Sets `removed`; notifies the author when it was public. Needs a note |
| **Looks fine** | Clears an edit re-check while keeping the current moderation state |

Publishing something that was removed or rejected also needs a note. The note stays internal; the author never sees it.

**Edit details** (footer of the window) lets you correct the post's fields as a moderator before deciding. **Open live post** shows the public page once the post is live.

Publication does not grant a trust badge. Use it only to decide whether the city can see the post.

### Check, then publish

A room, or a group that holds a flat, is checked like a property. The **Before publishing** panel has three ticks:

- Photos are real and match the post
- Not a duplicate of another post
- Details and location look right

Tick all three, then **Publish**. Hide and Remove need no ticks, and a post that is already public is not re-gated. Seeker posts and groups still looking for a flat go live first and are reviewed after, with no ticks.

### Ask the host

1. On a pending post, pick a **Reason**: Photos are not real, Duplicate post, Looks like a broker, Details are wrong, Locality unclear, Document unreadable, Name does not match, or Other.
2. Write the note and press **Needs info**. The post stays pending and off the board.
3. The host is told and sees your reason in their Support messages. Use **Chat with host** (**Chat with seeker** on a seeker post) in the same window to talk in Support chats.
4. When the host replies or edits, the case reopens, your ticks reset, and the card shows **Host replied (n)**. Read the reply, tick again, then decide.

## Badge decisions

Use the **Verified property badge** panel only for the host trust claim. A badge request opens with the banner "Host is seeking the Verified property badge", which names the basis (owner listing, or tenant with a rent agreement or light bill) and when it was asked.

| Button | Effect |
| --- | --- |
| **Approve Verified property** | Sets the review `approved` and applies the host badge |
| **Reject Verified property** | Sets the review `rejected`; a reason is required and shown to the host |
| **Revoke Verified property** | On an approved badge. A reason is required and the host is told why |

For tenant-tier claims, approval needs:

1. The host shows **KYC done**. Otherwise the panel says "Host has not verified their ID yet."
2. **Owner consent** recorded. Otherwise "Waiting for the owner to consent."
3. Open the document with **View agreement** or **View light bill** and tick that the name matches and the address matches this flat.
4. Enter the **Agreement end date** (must be in the future) or the **Bill date** (within the last 90 days).

The host's stated period is shown as a hint; the date you enter is what counts. Rejecting or revoking withholds the badge only; it does not take the post down. You cannot moderate or badge a post you wrote or belong to.

## Hold-for-review rule

Unflagged owner-tier posts and flatless posts (seeker posts, groups still looking for a flat) self-publish. A room with no photos, tenant-tier and identity-tier posts, and flagged posts are born `pending` until Ops uses **Publish**.

Legacy `live` means public. Moderator approval writes `approved`; both are public on the feed and in the **Published** tab.

An `expired` post lists under **Hidden & removed**. Only the host's renewal brings it back, so the Decision panel offers **Remove** and nothing else.

## Edit re-moderation

Edits are classified by what changed:

| Edit type | Queue result |
| --- | --- |
| Foundation change on a room or housed group | Returns to `pending` |
| Public content change such as photos, title, note, rent, deposit, map pin, details, lifestyle, or group seats | Keeps current visibility but adds **Edited since review** |
| Seeker-post profile or preference change | Adds **Edited since review** |
| Silent fields | No queue item |

When a re-check is present, read the changed fields and use **Looks fine** only if the current public or hidden state is still correct. Choose another decision if the edit changes visibility.

## Group applications

Group applications are not pre-moderated: they go live on submission and show under **Published**. Moderate after the fact. The owner's `accepted` or `declined` status is not yours to change. This desk writes only `modStatus`:

| Action | What it changes |
| --- | --- |
| **Clear** | The application may stand |
| **Hide for review** | The application is hidden from the moderation view |
| **Remove** | The application is removed by ops |

Never describe a moderation removal as the owner declining the applicant.

## What never to do

- Never approve a tenant badge without owner consent
- Never use **Publish** as a badge approval
- Never publish a room or group before the three checks are ticked
- Never use **Reject Verified property** to hide a public post
- Never decide an owner's group-application acceptance
- Never ignore an edit re-check on a live post
- Never treat `live` and `approved` as different public outcomes

## Related

- [Identity review](/help/a/identity-review)
- [Ownership and badges](/help/a/ownership-and-badges)
- [Reports and takedowns](/help/a/reports-and-takedowns)
