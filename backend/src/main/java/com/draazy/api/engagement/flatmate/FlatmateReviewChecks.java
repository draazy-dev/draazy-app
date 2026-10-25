package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.trust.OwnedDocumentLookup;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** What a reviewer attests to when approving a tenant-tier badge. The date asked for depends on the
 * evidence: an agreement's end date, or a light bill's bill date. */
record FlatmateReviewChecks(Boolean nameMatches, Boolean addressMatches, LocalDate validTill,
        LocalDate issuedOn) {

    // Same 90-day recurring-proof window as the property ownership gate (OwnershipEvidenceTypes);
    // engagement may not import moderation, so the number is repeated here.
    static final int BILL_MAX_AGE_DAYS = 90;

    /** One 422 naming everything still missing, so the reviewer fixes it in a single pass. */
    FlatmateReviewChecks validated(String evidenceType, LocalDate today) {
        boolean bill = OwnedDocumentLookup.ELECTRICITY_BILL.equals(evidenceType);
        List<String> problems = new ArrayList<>();
        if (!Boolean.TRUE.equals(nameMatches)) {
            problems.add(bill ? "nameMatches (the bill must name the flat owner)"
                    : "nameMatches (the agreement must name the host)");
        }
        if (!Boolean.TRUE.equals(addressMatches)) {
            problems.add("addressMatches (the document must show this flat)");
        }
        if (bill) {
            if (issuedOn == null) {
                problems.add("issuedOn (the bill date)");
            } else if (issuedOn.isAfter(today)) {
                problems.add("issuedOn must not be in the future");
            } else if (issuedOn.isBefore(today.minusDays(BILL_MAX_AGE_DAYS))) {
                problems.add("issuedOn is older than " + BILL_MAX_AGE_DAYS + " days; ask for a recent bill");
            }
        } else if (validTill == null) {
            problems.add("validTill (the agreement end date)");
        } else if (!validTill.isAfter(today)) {
            problems.add("validTill must be after today");
        }
        if (!problems.isEmpty()) {
            throw new ValidationException("Approval needs: " + String.join("; ", problems) + ".");
        }
        return this;
    }

    /** An agreement never outlives its own end date; a bill proves the claim only as of its date, so
     * the badge runs a fixed term from the approval. */
    LocalDate badgeUntil(String evidenceType, LocalDate today) {
        LocalDate term = today.plusMonths(FlatmateReview.BADGE_MONTHS);
        boolean bill = OwnedDocumentLookup.ELECTRICITY_BILL.equals(evidenceType);
        return bill || validTill.isAfter(term) ? term : validTill;
    }

    static LocalDate today() {
        return LocalDate.now(PlatformTime.IST);
    }
}
