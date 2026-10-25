---
title: Finance desk
slug: finance-desk
category: ops-playbook
audience: staff
access: staff
order: 28
updated: 2026-10-10
summary: How to read the Finance page, what each figure counts, and how to check it against the payment provider.
tags: [ops, internal, finance, revenue, payments]
modules: [finance]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **Needs attention** at the top of **Overview**: refund requests, service refunds and payment disputes waiting on a decision. It only shows when something is waiting.
- **Net revenue** and its change against last month.
- **MRR** (monthly recurring revenue) and the **Active paid plans** list.
- Any gap between what **Finance** shows and what customers tell Support they paid.

**Work on**

- Clear **Needs attention**: each line links to the desk that decides it.
- Weekly: compare **Transactions** with the payment provider console. See "Steps: weekly reconciliation".
- Download **Revenue CSV** at month end for the finance record.
- Report any figure that looks wrong to an admin with the tab, window and a screenshot.

## Desk and access

Use **Finance** at `/admin/finance`. It is admin only and staff do not see it under `/staff`. It needs `finance:read`. The page is read-only: you can look and download CSV files, not edit or refund anything.

An admin can switch the module off in **Settings ? Feature flags ? Admin Modules**.

## How the numbers are built

Money is read from **invoices** and **credit notes**. An invoice is issued only when the payment provider confirms a payment, and a credit note only when a refund is paid. A checkout that never finished is not money.

- **Collected**: everything customers paid.
- **Refunded**: everything paid back.
- **Pass-through**: stamp duty and registration on rent agreements. We collect it for the government, so it is not revenue.
- **Net revenue**: Draazy's own fees, less fees refunded. Collected ? Refunded ? Pass-through = Net revenue. It can be negative in a month with large refunds.

Days are counted in Indian time.

## What is on the page

| Tab / control | What it shows |
| --- | --- |
| **Revenue CSV** (top right) | Downloads `draazy-revenue.csv`: Month, Subscription fees, Service fees, Refunded fees and Net revenue for the last 24 months |
| **Overview** | **Needs attention**, four tiles, **Revenue by month**, **This month** and **Active paid plans** |
| **Transactions** | Every invoice and credit note, with search, Type and Date chips and **Export CSV** |

**Overview tiles**

| Tile | Meaning |
| --- | --- |
| **Net revenue** | Draazy's fees this month after refunds, with the change against last month |
| **Collected** | Everything paid this month, and how many payments |
| **Refunded** | Everything paid back this month |
| **MRR** | Active paid subscriptions, with quarterly plans divided by 3 and yearly by 12 |

**Revenue by month** stacks subscription and service fees per month, with refunds as bars below zero. Pick a window of 6, 12 or 24 months; the line under the title gives the net for that window. **This month** shows how Collected becomes Net revenue.

**Transactions.** Search by customer name or by invoice or credit-note number. The **Type** chips are **All**, **Subscriptions**, **Services** and **Refunds**. Each row shows the number, date, amount and Draazy's fee; refunds show a minus sign. Each page has 20 rows, taken from the newest 100. The note "Showing the newest N of M" tells you when older ones are not in view. **Export CSV** downloads every matching row as `draazy-transactions.csv`. The eye icon opens one document with its pass-through.

## Steps: weekly reconciliation

1. On **Transactions**, choose the week with the **Date** chips and note the count and amounts.
2. Open **Integrations**, then **Open Cashfree** on the **Payments** card, and find the same dates in the provider console.
3. Compare the counts and amounts. Search a name or number in **Finance** if one is missing.
4. For a mismatch, look in the **Integrations** call log for **Payment order** and **Payment webhook** with the order id.
5. If the money is in the provider console but not in **Finance**, report it to an admin with the order id. Do not edit anything yourself.

## Steps: answer a customer who says they paid

1. Search the person or the invoice number in **Transactions**.
2. An invoice means we received the money. No invoice means we did not confirm it.
3. With no invoice, check the call log with the order id. Raise it with an admin if the provider console shows it as paid.

## Never do

- Do not quote **Collected** as revenue: it includes refunds still to come out and government pass-through.
- Do not share the CSV files outside Draazy.
- Do not promise a customer a refund. **Finance** cannot issue one; refunds are decided on the [Refunds desk](/help/a/refunds-desk).
- Do not treat an empty ledger or an endless loading state as zero revenue. Reload, then report it.

## Related

- [Settings and integrations](/help/a/settings-and-integrations)
- [Analytics review](/help/a/analytics-review)
- [Drafting desk](/help/a/drafting-desk)
- [Referral fraud](/help/a/referral-fraud)
- [Refunds desk](/help/a/refunds-desk)
