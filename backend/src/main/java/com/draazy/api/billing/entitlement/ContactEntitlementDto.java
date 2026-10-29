package com.draazy.api.billing.entitlement;

public record ContactEntitlementDto(
        boolean unlimited,
        long used,
        Integer allowance,
        Integer remaining,
        int referralBonus,
        int friendBonus,
        String freeWindowEndsAt,
        String packExpiresAt) {
}
