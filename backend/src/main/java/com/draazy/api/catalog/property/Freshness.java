package com.draazy.api.catalog.property;

import java.time.Duration;
import java.time.Instant;

public enum Freshness {
    ACTIVE,

    AGING,

    STALE,

    DORMANT;

    static final int FRESH_DAYS = 7;
    static final int AGING_DAYS = 14;
    static final int STALE_DAYS = 30;

    public static Freshness of(Instant lastConfirmedAt, Instant createdAt, Instant now) {
        Instant since = lastConfirmedAt != null ? lastConfirmedAt : createdAt;
        if (since == null || now == null) {
            return ACTIVE;
        }
        long days = Math.max(0, Duration.between(since, now).toDays());
        if (days <= FRESH_DAYS) {
            return ACTIVE;
        }
        if (days <= AGING_DAYS) {
            return AGING;
        }
        if (days <= STALE_DAYS) {
            return STALE;
        }
        return DORMANT;
    }

    public String wire() {
        return name().toLowerCase();
    }

    public boolean needsOwnerAttention() {
        return this != ACTIVE;
    }

    public boolean unconfirmed() {
        return this == STALE || this == DORMANT;
    }

    public static Instant unconfirmedBefore(Instant now) {
        return now.minus(Duration.ofDays(AGING_DAYS + 1L));
    }

    public static Instant dormantCutoff(Instant now) {
        return now.minus(Duration.ofDays(STALE_DAYS + 1L));
    }
}
