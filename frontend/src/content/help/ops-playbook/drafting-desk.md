---
title: Drafting desk and service queues
slug: drafting-desk
category: ops-playbook
audience: staff
access: staff
order: 10
updated: 2026-11-06
summary: How staff work rent-agreement drafting and other paid service-request queues.
tags: [ops, services, rent-agreement, drafting, internal]
modules: [desk:rental, desk:legal, desk:interior, desk:packers, desk:valuation]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **Overdue** button count: rent-agreement cases past their desk target.
- **SLA** cell on rent agreements: **Due in** turns warning at 2 h left, then **Overdue by**; **Customer's turn** and **Waiting for tenant details** have no desk timer. An approved case also shows **register by** a date.
- Targets: pick up within 4 h, first draft 48 h, revision 24 h, registration 7 days.
- **To pick up** count. Other desks have no SLA cell: row age shows "due soon" (amber) after 24 h and "overdue" (rose) after 72 h.

**Work on**

- Work **Overdue** rent agreements first, then **To pick up** with **Take case**.
- Rows marked **Our move** are yours to act on. **With customer** rows wait on the customer.
- Finish first drafts and **changes-requested** revisions before the targets run out.
- Upload the registered copy for **approved** cases, then run **Registration check**.

## Desk and access

Each service is its own sidebar entry: **Rent Agreement** at `/admin/rent-agreement`, and **Property & Legal**, **Interior & Renovation**, **Packers & Movers** and **Property Valuation** at `/admin/legal`, `/admin/interior`, `/admin/packers` and `/admin/valuation`. Old `/ops/drafting-desk?type=…` and `/ops/<desk>` bookmarks redirect to the matching page.

A staff member sees only the service desks they were granted (**Rent Agreement** needs the rental desk function), under `/staff/…`. Admins and managers see every desk.

## Queue controls

| Control | Use it for |
| --- | --- |
| **To pick up / My cases / In progress / With customer / Closed / Cancelled** | Queue tabs with live counts (**My requests** on the other desks). **Closed** is completed work; **Cancelled** holds cases cancelled by the desk or withdrawn by the customer |
| **Overdue** | Rent-agreement SLA breaches only |
| **All / Today / 7d / 30d** | Date chips that narrow the list by when the request came in |
| **Name, mobile or request id** | Server-side search |
| **Customer tickets** | The desk's tickets tab (needs `tickets:read`) |

The list is paged at 20 rows. A failed load is shown as an error, not as an empty queue.

On the **Rent Agreement** desk each row shows an **Our move**, **With customer** or **Closed** chip, a **Yours** chip on cases you hold, and a **Step n of 7** line. The seven stages are Paid, Picked up, Papers verified, Draft shared, Approved, Registered and Police intimation. Inside a case, **Next case** jumps to the next one in the list. The **Messages** tab holds **Chat with customer** (the customer's support chat for that request), and a **Payment** tab appears on paid cases with the **Refunds** section. An **Activity** tab shows the history.

**Home Loans** is a ticket-style desk without this case window. Work it from its own request list.

## Status states

| Status | How it is reached | Staff action |
| --- | --- | --- |
| `awaiting-payment` | Paid service created before payment settles | Not in the working queue |
| `new` | Paid or free request ready for ops | Take it |
| `assigned` | **Take case** (rent agreement) or **Take this request** (other desks) | Start work |
| `in-progress` | Status set to in-progress | Continue work |
| `draft-shared` | **Share draft** succeeds | Customer reviews |
| `changes-requested` | Customer rejects the draft | Revise or cancel |
| `action-required` | **Send back for correction** | Owner or tenant fixes it; their **Done** returns it to `in-progress` |
| `approved` | Customer approves the draft | Upload final or registered copy |
| `completed` | Final document uploaded | Run the registration check if rental |
| `cancelled` | Staff cancel with a reason | Terminal |

Only `assigned`, `in-progress`, and `cancelled` are directly staff-settable. `draft-shared`, `approved`, `changes-requested`, `action-required`, and `completed` are created by draft upload, customer decision, send-back, and final upload.

## Age and SLA targets

Rent agreements carry server SLA due dates:

| State | Target |
| --- | --- |
| `new` | Pick up within 4 hours |
| `assigned` / `in-progress` | First draft within 48 hours |
| `changes-requested` | Revision within 24 hours |
| `approved` | Registration within 7 days |
| `draft-shared` / `action-required` | Customer's turn; no desk timer |

The **SLA** cell shows **Due in**, **Overdue by**, or **Customer's turn** from that SLA; **Waiting for tenant details** shows when the tenant has not yet filled their part. It turns warning when two hours or less remain. For an approved rental the statutory registration deadline (four months from approval) is also shown as **register by**, with a warning in the last 30 days. Non-rental queues fall back to age colouring: amber after 24 hours and rose after 72 hours while not completed or cancelled.

## Rent-agreement document procedure

1. Open the case. The rail shows the **next step** and whose move it is; the stage bar shows how far the case has come. Read **Parties** and **Property & terms**.
2. Use **Documents** to verify every required paper. If the checklist cannot load, retry before asking the customer for anything.
3. Check **Overlap check**. If another paid agreement overlaps the same flat and months, confirm the old tenancy ended or this is a replacement before drafting.
4. Use **Priced terms** only for rent, deposit, term, increment, or registration-area corrections. The customer must accept; any higher fee is paid before the draft goes out.
5. Use **ID numbers → Reveal** only when you hold the matter. Hide or close the modal when done; reads and refusals are audited.
6. Share the draft only after the checklist is verified and no priced-term amendment is open.

## Corrections

- **Fix it yourself.** While you hold the case and no draft is out with the customer, every card under Licensor, Licensee, Property and Terms has **Edit**, including passport, visa/OCI and FRRO details. List rows (furniture, deposit payments, occupants) can be added and removed there. Saving tells the customer how many details changed, with your note. Rent, deposit, term, escalation and registration area go through **Priced terms**.
- **Fix a PAN or Aadhaar.** Take the case first (admins too), then on **ID numbers**, **Reveal** and **Correct** on the party. Every party on the form is listed, even one whose numbers were never recorded. The customer is told an ID was corrected; the audit records who changed which party, never the number. Renaming a party on the form keeps their numbers.
- **Send it back.** Only for what you cannot do yourself: a fresh copy of a paper, or an answer only the customer has. Use **Send back for correction** in the rail, pick the side, tick the papers to upload again and/or ask your question. They get an in-app notification (WhatsApp when the template is set) and an amber banner on their tracker with an upload for each paper. Only the side you asked can mark it **Done**, and only once every ticked paper is uploaded again; that returns the case to `in-progress`, with their reply in the thread. Review the new copies on the checklist as usual.

## Draft checks and customer decision

Before **Share draft**, tick every drafting check: identity numbers, title proof, POA, address, and terms. The server refuses rent-agreement drafts without these checks.

A draft you share goes straight to the customer; no second operator checks it first. Share it only after the checklist is verified and every drafting check is ticked.

## Registration and trust evidence

After the customer approves the draft, upload the registered copy with the Sub-Registrar record: document number, Sub-Registrar office, registration date (not in the future) and GRAS GRN. The registered copy can be up to 2 MB; drafts and customer papers up to 1 MB.

For Leave & Licence Article 36A pricing, the code charges stamp duty from rent, term, non-refundable deposit, and 10% of refundable deposit per chargeable year; registration is ₹1,000 urban or ₹500 rural, plus ₹300 handling. Correct the registration area with **Priced terms** before sharing a draft if the locality body is wrong.

After completion, use **Registration check**:

1. Open the registered copy.
2. Compare it with the approved draft and the registration record.
3. Confirm each tenant only if the number was OTP-verified and you did not upload the copy. A colleague with the registration-check permission has to confirm it.
4. Use **Not on the copy** when the tenant is absent or not OTP-verified.

Confirmed registered tenancies can become trust evidence. Typed tenant numbers that were never OTP-confirmed cannot earn that badge.

## Police intimation

**Police intimation** is the last stage and completes on its own when you upload the registered copy. Registering on the IGR portal shares the tenant's details with the police, so there is nothing to file or record.

## Refunds and cancellation

Use **Refunds** only on paid rent-agreement requests. The holder asks for a refund; a manager approves it, and the manager alerted in their notifications opens the case from there. The refund also waits on the admin **Refunds** page under the **Rent agreement** filter, where a manager can decide it too. Staff cannot approve or reject a refund, only withdraw one they asked for, and never once the request is cancelled. A manager can approve a refund they asked for, including one their own cancel raised. Before duty is paid, everything paid can be refunded. After GRAS duty is paid, only the refundable balance beyond statutory charges can go back.

Use **Cancel request** only before `completed` or `cancelled`. A cancellation reason is required and is sent to the customer. Cancelling a paid rent agreement raises a refund of what is still refundable for a manager to approve. The customer is told it is waiting for approval, not that it is sent. If a refund was already waiting, the cancel keeps it rather than adding a second one.

## What never to do

- Never ask for documents when the checklist failed to load
- Never reveal identity numbers on a matter you do not hold
- Never share a rent-agreement draft with unverified papers
- Never approve your own registered copy
- Never refund a cancelled customer by hand: approve the refund the cancel raised
- Never ask the owner or tenant to file police intimation separately
- Never use `registration` or `docs_review` as a staff status

## Related

- [Service queues](/help/a/service-queues)
- [Verification SLAs](/help/a/verification-sla)
- [Identity review](/help/a/identity-review)
- [Ownership and badges](/help/a/ownership-and-badges)
