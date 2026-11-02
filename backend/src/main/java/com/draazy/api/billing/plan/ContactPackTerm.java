package com.draazy.api.billing.plan;

import java.time.Instant;
import java.util.UUID;

public record ContactPackTerm(UUID subscriptionId, Instant from, Instant until, int capacity, Instant frozenAt,
        String deal) {
    public ContactPackTerm(Instant from, Instant until, int capacity) {
        this(null, from, until, capacity, null, null);
    }
}
