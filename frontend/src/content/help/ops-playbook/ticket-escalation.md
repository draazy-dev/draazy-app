---
title: Chats, tickets and escalation
slug: ticket-escalation
category: ops-playbook
audience: staff
access: staff
order: 2
updated: 2026-11-06
summary: How staff tell a support chat, a desk case and an internal service ticket apart, and how to escalate each one.
tags: [ops, support, tickets, escalation, internal]
modules: [support, desk:loans]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **Support chats → Waiting on us** count: customers whose last message nobody has answered. See [Support chats](/help/a/support-chats).
- On desktop, the chat button bottom-right shows the same count on every staff page.
- Every desk's **Customer tickets** tab (and the **Home Loans** board): the age chip turns amber at 2 days open and rose at 5 days.
- P0 reports: money paid to someone claiming to be Draazy, a physical threat, or contact from police or a regulator.

**Work on**

- Answer **Waiting on us** chats first.
- Phone the ops lead for any P0 report; do not rely on a chat or ticket alone.
- On **Home Loans**, **Claim** unassigned tickets, press **Start** when you begin and **Resolve** when done.
- Set a ticket to **Waiting** only when the next step is the customer's.
- Escalate with the chat link or ticket id, what you checked and what you told the customer.

## Chat, desk case or service ticket

Three different things share the word "ticket" in old habits. They are not the same.

| Thing | Purpose | Lives in | Customer sees it |
| --- | --- | --- | --- |
| Support chat | People talking. One chat per customer, every message tagged **About** a property, flatmate post, request, payment, identity check or General. Has an owner, no priority, SLA or money | `/admin/support` and the dock | Yes, as the "Draazy support" chat |
| Desk case | Work with a decision: approve a listing, verify identity, draft an agreement, refund | Its own desk | Its status, yes |
| Service ticket | Internal lead for a service team, with team, assignee and private notes | The **Customer tickets** tab on each service desk, and the **Home Loans** board | No. The customer is never notified |

Customers do not file support tickets; they write in the chat, and desks link to it with **Chat with customer** instead of hosting their own thread. A service enquiry form (a service page or the Move-in Pack) does open a service ticket for that team on its own.

Never paste private notes into a chat. If a chat needs tracked work for a service team, press **Service ticket** in the chat header (Support access only), pick the team, add a subject and optional note, then **Create ticket**.

## Who can open what

| Surface | Route | Access |
| --- | --- | --- |
| Support chats | `/admin/support` | Support function, manager or admin sees everything; a desk function sees only its own topics (see [Support chats](/help/a/support-chats)) |
| Customer tickets tab | each service desk page (`?view=tickets`) | `tickets:read`, held through the **Support** or **Home Loans** function. Staff see their own desk's tickets; admins and managers see every desk |
| Home Loans board | `/admin/home-loans` | The Home Loans function |

Staff open these pages under `/staff/…`.

## Service ticket queue

Open the desk page and switch to **Customer tickets** (`?view=tickets`; Home Loans needs no switch). It has search, **Priority** and **Date** chips, **Export CSV**, and a `?open=<ticketId>` deep link.

| Field | Current behavior |
| --- | --- |
| Team | Staff are server-scoped to their own team; admins and managers can see all teams |
| Priority | Shown as a badge (`low`, `medium`, `high` or `urgent`) with a **Priority** filter. The screens have no priority editor, and tickets raised from a chat use the default |
| Assignee | Staff self-claim; admins and managers can assign to an active staff member on the ticket team |
| Notes | Private internal notes appended with **Add** / **Save**; customers never see them |
| Age | Non-terminal tickets show today, 2–4 day warning, or 5+ day breach |

### Service-ticket actions

| Button or control | Effect |
| --- | --- |
| **Claim** | Assigns the ticket to you; status stays `open` |
| **Start** | Admin console assigns first active team member if unassigned, then sets `in-progress` |
| **Resolve** | Sets `resolved` |
| **Open** | Opens the drawer/modal without mutating |
| **Status** select | Can set `open`, `in-progress`, `waiting`, `resolved`, or `closed` |
| **Activity / Add a note** | Appends one private note |

There is no transition table for service-request tickets; any legal status can be set from any other. Use `waiting` only when the next action is genuinely the customer's. Use `closed` for filed work where no resolution step is needed.

### Priority on service tickets

The backend accepts `low`, `medium`, `high` and `urgent`, but the ticket screens do not send priority changes. If the shown priority is wrong, record the real impact in a private note and escalate to the support lead or ops lead. For a P0 report, phone the ops lead immediately.

### Drafting-desk relationship

A service ticket is a hand-off row, not the work itself. The service desk pages (`/admin/rent-agreement`, `/admin/legal`, and so on) own the live service-request workflow: documents, identity reveal, drafts, customer approval, refunds, registration and cancellation. When a ticket points to a rent agreement or other service request, do the workflow on its desk and keep the ticket note as the staff hand-off trail.

## Handling procedure

1. Identify what you are looking at: a support chat, a desk case, or a service ticket.
2. Read the whole chat, case or ticket before replying or moving status.
3. Check the account, listing, invoice, service request or verification case.
4. Write customer-facing text only in the chat or the case's own customer message. Use private notes only on service tickets and desk notes.
5. If a screen fails to load, retry or escalate the outage; never treat an error as an empty queue.
6. Close with the outcome, not with "resolved".

## Auto-escalate to P0

Auto-escalate reports of money paid to someone claiming to represent Draazy, physical threat or harassment involving a visit, a payment charged with no invoice record, or contact from law enforcement or a regulator.

P0 goes to the ops lead **by phone**, not by assignment alone.

## Escalation ladder

Agent → Support lead → Ops lead → Trust & Safety for fraud or safety, Finance for money → Legal.

Every hop must include the chat link or ticket id, what you checked, what you told the customer, and why the next team owns it.

## Refund handling

Support chats cannot approve or process refunds. A chat can only collect the customer's request and keep them updated.

For rent-agreement refunds, send the case to the Rent Agreement desk: the holder asks for the refund and a manager approves it before the gateway refund is sent. For other paid products, use the [Refunds desk](/help/a/refunds-desk) or escalate to Finance with the transaction id and policy reason. Do not quote an internal cap or promise money back before the desk confirms the path.

## What never to do

- Never share another user's contact details, even to connect two parties
- Never confirm or deny whether a specific person has an account
- Never quote internal SLA figures to a consumer
- Never take a case to WhatsApp; keep it in the chat
- Never tell a customer nobody is waiting when the screen says it could not load
- Never approve a refund from a chat
- Never put staff-only notes in a chat reply; the customer reads it

## Related

- [Support chats](/help/a/support-chats)
- [Drafting desk and service queues](/help/a/drafting-desk)
- [Service queues](/help/a/service-queues)
- [Verification SLAs](/help/a/verification-sla)
- [Identity review](/help/a/identity-review)
