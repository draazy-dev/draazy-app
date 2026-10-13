---
title: Refunds desk
slug: refunds-desk
category: ops-playbook
audience: staff
access: staff
order: 14
updated: 2026-10-13
summary: How pass and contact-pack refund requests are decided, what the risk signals mean, and what never to promise.
tags: [ops, refunds, payments, disputes, internal]
modules: [refunds]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## What the desk is

Customers ask for a refund on a Listing Pass or Contact Pack from **Plan & Billing**. Eligible requests wait on the **Pending** tab for a person to decide. A payment taken in error is refunded automatically and lands on **Automatic**. Rent-agreement refunds stay in the rent-agreement desk.

## Daily checklist

**Monitor**

- The **Pending** count. Every request is promised a decision within **2 business days**.
- **Disputes** for chargebacks raised through a bank or card issuer.

**Work on**

- Open each **Pending** row, read the customer's reason and the signals, then **Approve** or **Reject**.
- Check **Automatic** only when a customer asks why a refund appeared.

## Desk and access

Use **Refunds** in the sidebar (`/admin/refunds`; staff open it under `/staff/refunds`). You need the **Refunds** function (`refunds:read` to view, `refunds:write` to decide).

## Tabs

| Tab | What it shows |
| --- | --- |
| **Pending** | Requests waiting for a decision |
| **Approved** | Refunds approved by staff, with the credit note |
| **Rejected** | Refused requests, with the reason the customer saw |
| **Automatic** | Refunds the system paid, such as a double charge |
| **Disputes** | Chargebacks. Only that purchase is frozen, never the account |

Only **Pending** rows can be approved or rejected; the other tabs are read-only. If a row was already decided or is under dispute, the desk tells you and reloads.

## Reading the signals

Each row shows the signals the server computed. Red means look closer.

| Signal | Why it matters |
| --- | --- |
| **Refunds in 12 mo** (red from 2) | A pattern of buying and refunding |
| **Linked accounts** (red above 1) | The same device or network behind more than one account |
| **Contacts used** | A pack with contacts used is not refundable |
| **Enquiries** | A pass that got enquiries is outside the no-enquiry guarantee |
| **Paused during guarantee window** | A paused listing is outside the guarantee, so a pass refund is not eligible |

Rows on the other tabs may show no signals.

The limits (reply window, refund windows, guarantee size) are set in **Settings → Fees → Refunds**.

## Steps: decide a request

1. Open the **Pending** tab and read the row.
2. To pay it, choose **Approve**. The refund goes to the original payment method in 5–7 business days, with a credit note.
3. To refuse it, choose **Reject** and write a reason. The customer sees it, so state the policy point plainly.
4. The row leaves **Pending**. The customer is notified either way.

While a request is pending, the pack's contacts are frozen or the pass's listing is paused. A rejection lets them resume.

## Never do

- Never promise a refund before a decision is recorded.
- Never reject without a reason.
- Never discuss other accounts behind a **Linked accounts** signal with the customer.
- Never treat a dispute as an account problem; only that purchase is frozen.
- Never tell a customer which fraud signal triggered a rejection.

## Related

- [Finance desk](/help/a/finance-desk)
- [Referral fraud review](/help/a/referral-fraud)
- [Invoices, refunds and receipts](/help/a/invoices-and-refunds)
