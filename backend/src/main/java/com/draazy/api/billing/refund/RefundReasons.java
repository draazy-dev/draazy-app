package com.draazy.api.billing.refund;

/** The machine-readable answers to "can I get this refunded?". */
public final class RefundReasons {

    private RefundReasons() {
    }

    public static final String PACK_UNUSED = "pack_unused";
    public static final String PASS_NO_ENQUIRIES = "pass_no_enquiries";
    public static final String NOT_ELIGIBLE_USED = "not_eligible_used";
    public static final String WINDOW_CLOSED = "window_closed";
    public static final String WINDOW_NOT_OPEN = "window_not_open";
    public static final String LISTING_PAUSED = "listing_paused";
    public static final String GUARANTEE_USED_RECENTLY = "guarantee_used_recently";
    public static final String ALREADY_REQUESTED = "already_requested";

    public static String explain(String reason) {
        return switch (reason) {
            case NOT_ELIGIBLE_USED -> "This order has been used, so it does not qualify for a refund.";
            case WINDOW_CLOSED -> "The refund window for this order has closed.";
            case WINDOW_NOT_OPEN -> "The no-enquiry guarantee can be claimed once its first days have passed.";
            case LISTING_PAUSED -> "The listing was not live for the whole guarantee period, so the guarantee does not apply.";
            case GUARANTEE_USED_RECENTLY -> "The no-enquiry guarantee was already used recently on this account.";
            case ALREADY_REQUESTED -> "A refund was already requested or issued for this order.";
            default -> "This order does not qualify for a refund.";
        };
    }
}