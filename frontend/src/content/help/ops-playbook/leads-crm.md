---
title: Leads CRM
slug: leads-crm
category: ops-playbook
audience: staff
access: staff
order: 15
updated: 2026-11-06
summary: How staff claim leads from the Common pool, log outreach, change stages and convert, and what the audited number reveal means.
tags: [ops, leads, crm, sales, internal]
modules: [leads]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **My leads**: the "{n} due now" note shows how many of your leads need contact today. A **Due** chip marks each one.
- **Common pool**: unowned leads anyone with the Leads function can take.
- Managers: **All** and **Performance** tabs.

**Work on**

- Clear **Due** leads on **My leads** first, then take new ones from the **Common pool**.
- Log every call or message the moment it ends, so the next person sees the true history.
- Close or release leads you will not work. The cap is 50 open leads per person.

## Desk and access

Open **Leads** (`/admin/leads`; staff use `/staff/leads`) in the **Sales** group. It needs the **Leads** function, granted in [Team & access](/help/a/team-and-access). Admins and managers have it by default. Anyone with the function can add and update leads. Managers and admins also see **All**, **Performance**, and can assign.

## Where leads come from

- **Feeds.** Draazy turns customer activity into leads: rent agreements registered (owner and tenant), service checkouts left unpaid, quote requests, leases ending within 60 days (only for people who opted in to marketing), and flatmate posts and rooms. Each lead shows why it exists under **Why they're a lead**.
- **Add lead.** For a walk-in, call or WhatsApp enquiry, press **Add lead**. Enter a 10-digit mobile number (no +91), pick a lead type and where it came from. Re-adding a number updates that lead instead of making a duplicate.
- **Bad feed rows are rejected for good.** A signal with an invalid mobile number, or a number that belongs to an archived, staff, manager or admin account, is recorded as rejected and never becomes a lead. Adding such a number by hand fails with "This number belongs to a staff or closed account and cannot be added as a lead".
- A lead marked **Do not call** is never reopened by a new signal. A **Lost** or **Not reachable** lead goes back to **New** when a fresh signal arrives.

## Claim, release, assign

| Action | Who | Rule |
| --- | --- | --- |
| **Claim** | Anyone with the Leads function | One owner at a time. "Already owned by {name}" means someone got there first. A **Do not call** lead cannot be claimed |
| Open-lead cap | Everyone | 50 open leads (New, Contacted, Interested). Over the cap you get "You already have 50 open leads" |
| **Release** | The owner or a manager | Sends the lead back to the Common pool |
| Idle release | Automatic | A lead with no activity for **72 hours** goes back to the pool |
| **Assign / Reassign** | Managers and admins | Pick any active staff member; each shows their open count |

## Number reveal is audited

The list shows only a masked number. Opening a lead shows the full number with a tap-to-call link and a **Copy** button. Every reveal is written to the audit log (`lead.reveal`) and adds a **Number viewed** entry to the lead's **Timeline**, once per person per day. Open a lead only when you mean to work it.

A lead set to **Do not call** never shows its number.

## Log what happened

The **Call** and **WhatsApp** buttons appear only on your own open leads. After a contact the buttons stay off for **24 hours** ("Next contact after …") unless a follow-up is due.

After you call or message, the sheet **How did it go?** asks for:

- **Channel**: Call or WhatsApp.
- **Outcome**: Spoke to them, No answer, Busy, Switched off, Wrong number, or Message sent.
- An optional note and an optional follow-up: **Tomorrow**, **In 3 days** or **In a week**.

Some outcomes move the stage for you:

| Outcome | Result |
| --- | --- |
| Wrong number | **Lost** |
| No answer, Busy, Switched off | Counts as a failed attempt; the **3rd** failed attempt makes it **Not reachable** |
| Spoke to them | Resets the failed attempts; a **New** lead becomes **Contacted** |
| Message sent | A **New** lead becomes **Contacted** |

## Stages and converting

Stages: **New**, **Contacted**, **Interested**, **Converted**, **Lost**, **Not reachable**, **Do not call**.

- **Change stage** always needs a reason ("Why? (required)"). **Contacted** and **Interested** also need a future follow-up date.
- **Do not call** asks you to confirm: "They asked not to be contacted. This can't be undone." Use it whenever someone asks you to stop.
- You cannot set **Converted** by stage. Use **Convert**, then pick the paid service request that came from this lead. Managers can later use **Change credit** to move the credit to another staff member.
- Closed leads (**Do not call** and **Converted**) cannot change stage.

Other tools on a lead: **Add note**, **Edit profile** (lead type, intent, property types, BHK, localities, budget, source), **Interested in** (services the lead might need), and the **Timeline** of every call, note and stage change.

## Performance (managers)

**Performance** shows each staff member and an **Everyone** total for 7, 30 or 90 days: converted, rate, revenue, open, claimed, contacted, attempts and average first contact time.

## Never do

- Never call a lead marked **Do not call**, and never reopen it.
- Never share a lead's number outside the desk, or copy it into a personal phone book.
- Never mark a lead **Converted** without a paid request behind it.
- Never hoard leads; release what you will not work.

## Related

- [Staff desks at a glance](/help/a/staff-desks)
- [Team and access](/help/a/team-and-access)
- [Support chats](/help/a/support-chats)
