package com.draazy.api.billing.entitlement;

import java.util.List;

public record ListingEntitlementDto(
        int allowance,
        long used,
        List<Pass> passes) {
    public record Pass(String propertyId, String expiresAt) {
    }
}
