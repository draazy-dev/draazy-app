package com.draazy.api.billing.entitlement;

public record ContactEntitlementDto(
        boolean unlimited,
        long used,
        Integer allowance,
        Integer remaining,
        Integer remainingRent,
        Integer remainingBuy,
        int friendBonus,
        String freeWindowEndsAt,
        String packExpiresAt) {
}
