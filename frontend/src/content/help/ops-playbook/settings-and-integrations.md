---
title: Settings and integrations
slug: settings-and-integrations
category: ops-playbook
audience: staff
access: staff
order: 29
updated: 2026-11-06
summary: How admins change site settings, fees, served districts and flags safely, and how to read provider status and the call log.
tags: [ops, internal, settings, integrations, flags, fees]
modules: [settings, integrations]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **Integrations**: the **Failed** count in **Last 24h** on the **Email**, **WhatsApp** and **Payments** cards.
- **Last failure** and its detail on each card. Compare it with **Last success**.
- **Settings → Feature flags**: **Maintenance mode** is off, and nothing else was switched without a reason.
- After any change by a colleague: the site behaves the way they said it would.

**Work on**

- Open the **Failed** filter in the call log and look for repeats on the same operation.
- For one customer's problem, search the call log by their full email, mobile or order id.
- Make planned changes in **Settings** in the order given under "Steps: change a setting".
- Weekly: read **Fees** and **Move-in Pack** prices against the approved price list.

## Desk and access

Both pages are admin only and are not available under `/staff`.

| Page | Route | Permission | Mode |
| --- | --- | --- | --- |
| **Settings** | `/admin/settings` | `settings:read` to view, `settings:write` to save | Read and write |
| **Integrations** | `/admin/integrations` | `settings:read` | Read-only |

A viewer without `settings:write` can open **Settings** but cannot save. The system does not ask for approval from a second admin. Changes save straight away, so follow the team habit below.

## Settings tabs

| Tab | What you can change | Button |
| --- | --- | --- |
| **General** | Site name, Legal name, Tagline, Support email, Support phone, WhatsApp, Support hours, Address | **Save details** |
| **General** | **Grievance officer**: Name and Email, shown on the Refund Policy page | **Save officer** |
| **General** | **Max photos per listing** (3 to 20) | **Save photo limit** |
| **General** | **Max flatmate groups per person** (1 to 10) | **Save group limit** |
| **Fees** | Rent listing pass (60 days), Sale listing pass (90 days), Rent contact pack (15 contacts, 30 days), Buy contact pack (15 contacts, 60 days), Rent agreement platform fee, Free owner contacts, Featured days after verification | **Save fees** |
| **Fees** | **Referrals**: **Agreement discount %** (`referralAgreementDiscountPercent`, default 50), **Invites per day** (`referralInvitesPerDay`, default 10), **Redeem failures per day** (`referralRedeemFailuresPerDay`, default 5), friend gifts, monthly and yearly caps, hold, clawback and redeem windows, fraud-signal retention (180 days) | **Save referrals** |
| **Fees** | **Refunds**: owner reply window, open contacts and visits per seeker, contact pack refund window, listing pass guarantee | **Save refunds** |
| **Fees** | **Move-in Pack**: a **Live** / **Coming soon** switch and six service prices | **Save Move-in Pack** |
| **Maps** | **Served districts**, **Keep search inside served districts**, **Blacklisted places** | Each change saves at once |
| **Feature flags** | **Application** and **Admin Modules** switches | Each switch asks you to confirm |

**Fees notes.** Each card saves on its own. A blank field is refused with "Fill in every value. A blank field is not saved as 0." Referrals and Refunds fields have an allowed range; a value outside it shows "A value is outside its allowed range." Count fields such as **Free owner contacts** show no ₹ sign. Subscribers already charged keep the amount they paid; **Finance** lists them by charged price.

**Maps tab.** Nothing on this tab has a Save button; every change saves straight away and shows a toast.

| Card | What it does |
| --- | --- |
| **Served districts** | New localities and societies are accepted only inside these districts. Search "Add a district, e.g. Satara" to add one; the **x** on a chip runs **Stop serving**. At least one district must stay served (the last **x** is disabled). Up to 40 districts. A map below shows the districts when a Google Maps key is set up |
| **Listed places outside these districts** | Lists existing localities and societies that sit outside the served districts, or "None found." When some older places were never checked, **Check n older places** runs the check. If Google is unavailable, try again shortly |
| **Keep search inside served districts** | On: shopper search suggests only places inside the served districts. Off: those places only rank first |
| **Blacklisted places** | Hidden from every search box in the app. Add from **Hide a place**: pick a place (shown as **Exact place**) or choose "Hide every name containing …" (shown as **Name contains**, which is broad). The bin icon removes an entry |

Removing a district does not delete places already listed in it; they appear under **Listed places outside these districts**. Review them in [Society moderation](/help/a/society-moderation) and the [Localities desk](/help/a/localities-desk).

**Flags.** Each switch asks you to confirm (**Enable** or **Disable**) and shows a toast. Application flags sit in four groups: **Discovery & Engagement**, **Trust**, **Monetization & Payments** and **Platform & Access**. The ones to treat with care:

| Flag | Effect |
| --- | --- |
| **Plan purchases** (off) | Pauses new purchases. Active plans keep working |
| **Referral rewards** (off) | Hides referral routes and stops new invites. Earned rewards still count |
| **Public signups** (off) | Closes new registration |
| **Staff login** (off) | Staff and managers cannot sign in. Administrators always can |
| **Maintenance mode** (on) | Blocks all consumer access. Off by default. Turning it on asks for confirmation in red |
| **Admin Modules** | Hides a module for everyone. **Properties** and **Users** are **Core** and cannot be switched |

## Integrations page

Three cards: **Email** (Zoho ZeptoMail), **WhatsApp** (Meta Cloud API) and **Payments** (Cashfree). Each shows:

- A **Live** or **Mock** chip. It comes from the server setup, not from a live check. **Live** does not prove the provider is healthy. **Mock** means no real messages or payments go out through that provider.
- **Last 24h** and **Last 7 days** counts of ok and failed calls.
- **Last success**, **Last failure** and the failure detail.
- An **Open** link (for example **Open Cashfree**) to the provider's own console.

Email carries customer mail and the copy of each staff bell alert that is emailed to staff accounts (see [Verification SLAs](/help/a/verification-sla)). If **Email** shows **Mock**, no one receives those emails.

**Referral invites on WhatsApp.** Referral invites use a Meta MARKETING-category template. It is set by `WHATSAPP_REFERRAL_INVITE_TEMPLATE_NAME`, `WHATSAPP_REFERRAL_INVITE_TEMPLATE_LANG` and `WHATSAPP_REFERRAL_INVITE_PHONE_NUMBER_ID`. The number id falls back to the main login-OTP sender number. Each delivered message costs about ₹1 including GST, and Meta may not deliver to people who have reached their marketing message limit. If the template is not set, the referrer's own WhatsApp opens instead. Invites go from the login-OTP number, so check its quality rating in WhatsApp Manager each week. If it drops to Low, turn off **Referral rewards** and tell an admin, because a restricted number also stops login codes.

The call log keeps 30 days. It has the search box "Full email, mobile or order id" (people are stored masked, so use the full value), **Provider**, **Outcome** (**All**, **Failed**, **OK**, **Not sent**) and **Date** chips, and 20 rows per page. Operations are Email, Login OTP, KYC decision, Payment order, Refund and Payment webhook. **Not sent** means the call was skipped, for example in **Mock**. If a part of the page could not load, a red banner says so with **Retry**; that is missing data, not a quiet period.

## Steps: change a setting

1. Write down the current value, and what you are changing it to and why.
2. Ask another admin to check it before you save. The system does not require this, so do it as a team habit for **Fees**, **Maintenance mode**, **Public signups**, **Staff login**, **Plan purchases**, served districts and blacklisted places.
3. Save it. Then reload the page and confirm the new value shows.
4. Verify the effect as a customer. For a fee, open the plan page. For a flag, check that the feature appears or hides. For a district or a blacklisted place, search for it in a shopper search box.
5. Tell the team what changed and when.

Small fixes to **General** text are low risk. Changes to prices, flags and districts affect customers at once.

## Steps: investigate a failure

1. Open **Integrations**, choose the provider chip, then **Failed**.
2. Read the detail and note the operation, time and order id.
3. Check the provider's console with its **Open** link and compare.
4. For repeated failures, tell an admin with the operation and times. Do not change flags to work around it.

## Never do

- Do not turn on **Maintenance mode** during working hours without telling everyone first.
- Do not change a price while a customer is mid-payment.
- Do not ignore **Someone else changed these settings — reload to see their changes.** Reload the page, check the current values, then make your change again.
- Do not trust **Live** as proof. Read the call log.
- Do not paste customer details into the **Hide a place** search box.

## Related

- [Finance desk](/help/a/finance-desk)
- [Erasure requests](/help/a/erasure-requests)
- [Staff desks](/help/a/staff-desks)
- [Analytics review](/help/a/analytics-review)
