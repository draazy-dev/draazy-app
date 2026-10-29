package com.draazy.api.catalog.property;

public record TrustStatsResponse(
        long verifiedListings,
        long totalListings,
        long verifiedOwners) {
}
