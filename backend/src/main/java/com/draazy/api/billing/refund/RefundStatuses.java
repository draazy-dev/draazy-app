package com.draazy.api.billing.refund;

import java.util.Set;

public final class RefundStatuses {

    private RefundStatuses() {
    }

    public static final String PENDING_REVIEW = "pending_review";
    public static final String APPROVED = "approved";
    public static final String REJECTED = "rejected";

    /** Desk filters that are not request states: system refunds, and orders the gateway is disputing. */
    public static final String AUTO = "auto";
    public static final String DISPUTED = "disputed";

    public static final Set<String> DESK_FILTERS = Set.of(PENDING_REVIEW, APPROVED, REJECTED, AUTO, DISPUTED);

    public static final String KIND_LISTING_PASS = "listing_pass";
    public static final String KIND_CONTACT_PACK = "contact_pack";

    public static final String BASIS_PACK_UNUSED = "pack_unused";
    public static final String BASIS_PASS_NO_ENQUIRIES = "pass_no_enquiries";
}