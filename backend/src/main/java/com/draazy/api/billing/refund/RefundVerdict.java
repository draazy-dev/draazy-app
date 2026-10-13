package com.draazy.api.billing.refund;

import java.time.Instant;

/** Whether an order may be refunded and why; {@code from}/{@code until} bound the claim window when there is one. */
public record RefundVerdict(boolean eligible, String reason, String basis, Instant from, Instant until) {

    static RefundVerdict yes(String reason, String basis, Instant from, Instant until) {
        return new RefundVerdict(true, reason, basis, from, until);
    }

    static RefundVerdict no(String reason, Instant from, Instant until) {
        return new RefundVerdict(false, reason, null, from, until);
    }
}