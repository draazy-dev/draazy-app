package com.draazy.api.admin;

import java.util.List;

public record AdminFinance(
        long mrr,
        List<PlanLine> plans,
        Money month,
        Attention attention) {

    public record PlanLine(String name, String audience, String billingCycle, long price,
            long active, long monthlyValue, Integer termDays) {
    }

    /** {@code collected - refunded - passThrough == net}; pass-through is statutory money Draazy only forwards. */
    public record Money(long collected, long refunded, long passThrough, long net, long payments) {
    }

    public record Attention(long refundRequests, long refundRequestAmount, long serviceRefunds,
            long serviceRefundAmount, long openDisputes, long openDisputeAmount) {
    }
}
