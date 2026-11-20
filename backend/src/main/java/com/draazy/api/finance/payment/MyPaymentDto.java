package com.draazy.api.finance.payment;

import java.time.Instant;

public record MyPaymentDto(String id, String kind, String label, long amount, Instant paidAt, String invoiceNo,
        String status, String creditNoteNo, String propertyId, String serviceRequestId, Refund refund) {
    public static final String PAID = "paid";
    public static final String REFUND_PENDING = "refund_pending";
    public static final String REFUNDED = "refunded";
    public static final String REFUND_REJECTED = "refund_rejected";
    public static final String DISPUTED = "disputed";

    public record Refund(boolean eligible, String reason, Instant from, Instant until, long amount) {
    }
}