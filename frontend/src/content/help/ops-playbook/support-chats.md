---
title: Support chats
slug: support-chats
category: ops-playbook
audience: staff
access: staff
order: 8
updated: 2026-11-06
summary: How staff use the Support chats inbox: one chat per customer, who owns it, what each desk can see, and when to raise a service ticket.
tags: [ops, support, chats, inbox, internal]
modules: [support]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **Waiting on us** count on `/admin/support`: customers whose last message nobody has answered. A teal dot marks unread rows.
- On desktop, the round chat button bottom-right shows the same waiting count on every staff page.
- If the inbox says "We could not read the support chats", try again. That is not an empty inbox.

**Work on**

- Work **Waiting on us** first.
- Check **Mine** for chats you own that the customer has answered.
- Resolve a chat when the customer has what they need.

## Desk and access

Open **Support chats** (`/admin/support`; staff use `/staff/support`). What you see depends on your functions, in [Team & access](/help/a/team-and-access):

| You hold | You see |
| --- | --- |
| **Support**, or you are a manager or admin | Every chat and every topic, including **General**. You can assign, resolve and raise service tickets |
| **Listing moderation** or **Property verification** | Property topics only |
| **Flatmates** | Flatmate topics only |
| A service desk (Rent Agreement, Property & Legal, and so on) | Request topics for your own desks only |
| **KYC review** | Identity topics only |
| **Refunds** | Payment topics only |

A desk-scoped view has no **Mine** tab, no **Assign to me** or **Resolve**, and its **About** filter lists only your topics. Sending a reply outside your topics fails with "This chat topic is outside your desk." Home Loans alone does not open the inbox.

## One chat per customer

Each customer has **one** continuous chat. Every message is tagged with what it is **About**: a property, a flatmate post, a service request, an identity check, a payment, or General. There is no separate thread per question.

| Tab | Shows |
| --- | --- |
| **Waiting on us** | The customer spoke last on at least one topic |
| **Mine** | Chats assigned to you that are not resolved (full access only) |
| **All** | Every chat in your scope, newest first |

The **About** filter narrows any tab to Property, Flatmates, Requests, Identity, Payments or General. Each row shows the customer, time, a preview ("Support:" when we spoke last), the **About** chip, a **Waiting** chip, and **Handled by {name}** or **Unassigned**.

## Working a chat

Open a row. The header shows the customer's name and masked mobile, a status chip (**Waiting on us**, **Answered** or **Resolved**) and who handles it.

- **Case chips** list the customer's open cases. Tap one to reply about that case.
- **Reply about** sets what your reply is about. It defaults to what the customer asked about last.
- Enter sends; Shift+Enter adds a line. Replies can be up to 4,000 characters.
- Timeline dividers show when the topic changed.

A reply about a property review, a flatmate post or a service request lands on that case too, so the desk that owns it sees it.

### Who owns a chat

The **first full-access replier** becomes the owner. Everyone else sees **Handled by {name}**. A desk answering its own topic does not take the whole chat. To take over, press **Take over** (shown instead of **Assign to me** when someone else owns it).

### Resolve and reopen

**Resolve** marks the chat resolved and clears unread. It also resolves the customer's open support tickets behind the chat, except identity appeals and disputes, which stay with their desk. There is no reopen button: when the customer writes again the topic goes back to **Waiting on us**. A staff reply on a resolved chat makes it **Answered**.

## From a desk

Property review, flatmate review, the service queues and the rent-agreement desk show a **Chat with customer** button (with a count of messages). It opens the customer's chat at that case: a docked window on desktop, or the inbox on a phone. If it says "Couldn't reach this customer's support chat.", press **Retry**.

The dock (desktop only) opens up to three chat windows, which you can minimise or close. It is hidden on the inbox page itself.

## Chat, desk case, service ticket

| Thing | Purpose | Lives in |
| --- | --- | --- |
| Support chat | People talking. No priority, SLA or money | `/admin/support` and the dock |
| Desk case | Work with a decision: approve a listing, verify identity, draft an agreement, refund | Its own desk |
| Service ticket | Internal lead for a service team. The customer is never told | **Customer tickets** tab on that desk |

To raise one, press **Service ticket** in the chat header (full access only), pick the team, write a subject and optional note, then **Create ticket**. See [Chats, tickets and escalation](/help/a/ticket-escalation).

## Never do

- Never approve or promise a refund in a chat. Send it to [Refunds desk](/help/a/refunds-desk) or the service desk.
- Never put staff-only notes in a reply. The customer reads it.
- Never share another user's contact details.
- Never move the conversation to WhatsApp or personal email.
- Never tell a customer nobody is waiting when the inbox failed to load.

## Related

- [Chats, tickets and escalation](/help/a/ticket-escalation)
- [Staff desks at a glance](/help/a/staff-desks)
- [Service queues](/help/a/service-queues)
- [Identity review](/help/a/identity-review)
