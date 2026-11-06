---
title: Identity review
slug: identity-review
category: ops-playbook
audience: staff
access: staff
order: 3
updated: 2026-11-06
summary: Internal KYC desk procedure for reviewing captured ID documents, selfies, appeals and revocations.
tags: [ops, kyc, identity, internal]
modules: [kycReview]
---

> [!IMPORTANT]
> Internal runbook. Visible to Draazy staff only.

## Daily checklist

**Monitor**

- **Needs review** tab, newest first — amber from 24 h ("due soon"), rose from 48 h ("overdue"). Each row shows when the case was created or last updated.
- **Overdue** button count: pending cases past 48 h.
- **Claim** chips (All, Unclaimed, Mine n/3, Others): you can hold at most 3 cases at once.
- **Appeals** tab count: rejected applicants who asked for a second look. These also raise a staff alert.
- A pending case left for 14 days is rejected automatically, so keep the oldest moving.

**Work on**

- Clear **Overdue** cases first, then work the rest of **Needs review**.
- Answer every open **Appeals** case: uphold the rejection or reopen it for a fresh review.
- Finish a case you open: opening it holds it for you for 30 minutes.
- Decide each case from the evidence in it; never your own case.

## Desk and access

Use **KYC review** at `/admin/kyc-review` (staff open it under `/staff/kyc-review`). It belongs to the **KYC review** function; the page needs `identity:write` (there is no view-only version), which covers viewing, claiming, approving, rejecting and revoking.

The customer submits a camera-captured identity document image and selfie through the identity flow. Review only what the case shows; do not ask for documents outside the product flow.

A row opens one case in a window: document images and what the applicant entered on the left, the selfie and pose below, **History** collapsed, and every action in the rail on the right. **Next case** moves to the next case you can take; **Refresh links** renews the image links. A case someone else holds opens read-only with no decide forms. Duplicate warnings (the same document on another account) show above the images.

**Edit account** under the applicant's entries changes the account name or email. Use it only to fix a clear typo.

## Queue tabs

| Tab | What it contains | Sort and page size |
| --- | --- | --- |
| **Needs review** | Pending identity submissions | Newest first; 10 per page |
| **Appeals** | Rejected cases the applicant asked to have checked again; tagged **Appeal** | Newest first; 10 per page |
| **Decided** | Verified, rejected and revoked cases | Newest first; 10 per page |

Filters: name or mobile, document type and the **Date** chips (All, Today, 7d, 30d) on every tab; **Claim** and **Overdue** on **Needs review**; **Outcome** (Verified, Rejected, Revoked) on **Decided**. **Clear filters** resets them. Filters reset when you change tab. The list is always newest first.

## Targets and stale handling

| Item | Rule |
| --- | --- |
| Warning age | The UI marks old pending cases amber at 24 hours |
| Overdue filter | The backend counts pending cases as overdue at 48 hours |
| Claim hold | Opening a pending case claims it for 30 minutes |
| Active claims | A reviewer may hold 3 active identity cases |
| Stale pending sweep | Cases older than 14 days are rejected as `not_reviewed`; images are purged and the attempt window is reset |

**Force release** is admin-only. Use it only when another reviewer has clearly abandoned a claim; managers and staff ask an admin. The button asks for confirmation before clearing the hold. You cannot decide your own identity case.

## Approval checklist

Approve only after all of these are true:

1. Every visible checklist item is ticked.
2. The document number is present.
3. The holder name is present.
4. Either full date of birth or birth year is present; never both.
5. The holder is at least 18.
6. Birth year is between 1900 and the allowed adult cutoff.
7. The selfie and document holder match.
8. If a liveness challenge exists, **Confirm the requested pose** is ticked.

Type the document number, holder name and date of birth (or tick **Year only (old Aadhaar)** and enter the birth year) from the image, and pick the gender on the document. If your number does not match the applicant's entry you are asked to re-check; tick the override only when you read it from the image and the applicant's entry was wrong. The case then shows **Number corrected by reviewer**. Approving sets the account name to the holder name you confirmed.

Use **Approve review** only when the button is enabled. An approval is final; there is no second check.

## Rejection rules

Use **Reject review** for cases that cannot pass from the submitted evidence. Pick one reason:

| Reason | Use when |
| --- | --- |
| `blurry` | Text or face cannot be read |
| `cropped` | Required document area is missing |
| `mismatch` | Selfie, name or number does not match |
| `expired` | Document is no longer valid |
| `not_holder` | Submitter is not the document holder |
| `unsupported` | Document type is outside the accepted set |
| `other` | The case is invalid for another visible reason |

Write a note of at least 10 characters for `mismatch`, `not_holder` and `other`.

## Appeals

When a rejected applicant asks for a second look, the case appears under **Appeals** with their note.

- **Uphold rejection** closes the appeal and the rejection stands.
- **Reopen for review** sends the case back to **Needs review** for a fresh decision. It is offered only while the photos are still stored; once they are purged the appeal can only be upheld.
- You cannot decide an appeal on your own identity case.

## Revocation

Use **Revoke** or **Revoke badge** only when the verified badge should be removed. Revocation needs a reason between 10 and 300 characters and is audited.

An identity-earned verified badge cannot be withdrawn from the user badge screen. Revoke it from the identity review record.

## Never do in identity review

- Do not ask an admin to force-release an active colleague unless needed to keep the queue moving.
- Do not accept a typed document value that contradicts the captured image.
- Do not store copies of the captured document or selfie outside the case.

## Related

- [Chats, tickets and escalation](/help/a/ticket-escalation)
- [Verification SLAs](/help/a/verification-sla)
- [Ownership and badges](/help/a/ownership-and-badges)
- [Referral fraud review](/help/a/referral-fraud)
