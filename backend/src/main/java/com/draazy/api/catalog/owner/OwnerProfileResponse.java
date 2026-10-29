package com.draazy.api.catalog.owner;

public record OwnerProfileResponse(
        String name,
        String mobile,
        boolean verified,
        String city,
        Integer memberSince,
        long listingCount) {
}
