package com.draazy.api.billing.entitlement;

import java.util.List;

/** {@code used} counts live listings no pass covers; {@code passes} lists the listings an unexpired pass covers. */
public record ListingEntitlementDto(
        int allowance,
        long used,
        List<Pass> passes) {

    public record Pass(String propertyId, String expiresAt) {
    }
}
