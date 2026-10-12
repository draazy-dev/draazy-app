package com.draazy.api.billing.entitlement;

/** Contract {@code ContactEntitlement}; {@code allowance = used + remaining}, both null when unlimited. */
public record ContactEntitlementDto(
        boolean unlimited,
        long used,
        Integer allowance,
        Integer remaining,
        int referralBonus,
        String freeWindowEndsAt,
        String packExpiresAt) {
}
