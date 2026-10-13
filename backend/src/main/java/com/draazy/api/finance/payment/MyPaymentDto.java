package com.draazy.api.finance.payment;

import java.time.Instant;

/** One paid order in the caller's payment history; {@code refund} is set for listing passes and contact packs only. */
public record MyPaymentDto(String id, String kind, String label, long amount, Instant paidAt, String invoiceNo,
        String status, String creditNoteNo, String propertyId, String serviceRequestId, Refund refund) {

    public static final String PAID = "paid";
    public static final String REFUND_PENDING = "refund_pending";
    public static final String REFUNDED = "refunded";
    public static final String REFUND_REJECTED = "refund_rejected";
    public static final String DISPUTED = "disputed";

    /** @param from when a not-yet-open claim window opens; {@code until} when an open one closes */
    public record Refund(boolean eligible, String reason, Instant from, Instant until, long amount) {
    }
}