package com.draazy.api.billing.plan;

import java.time.Instant;
import java.util.UUID;

/** One paid contact pack. A frozen pack keeps the contacts it already served but supplies no more. */
public record ContactPackTerm(UUID subscriptionId, Instant from, Instant until, int capacity, Instant frozenAt) {

    public ContactPackTerm(UUID subscriptionId, Instant from, Instant until, int capacity) {
        this(subscriptionId, from, until, capacity, null);
    }

    public ContactPackTerm(Instant from, Instant until, int capacity) {
        this(null, from, until, capacity, null);
    }

    public boolean frozen() {
        return frozenAt != null;
    }
}
