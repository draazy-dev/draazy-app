package com.draazy.api.billing.refund;

import java.time.Instant;

public record RefundVerdict(boolean eligible, String reason, String basis, Instant from, Instant until) {
    static RefundVerdict yes(String reason, String basis, Instant from, Instant until) {
        return new RefundVerdict(true, reason, basis, from, until);
    }

    static RefundVerdict no(String reason, Instant from, Instant until) {
        return new RefundVerdict(false, reason, null, from, until);
    }
}