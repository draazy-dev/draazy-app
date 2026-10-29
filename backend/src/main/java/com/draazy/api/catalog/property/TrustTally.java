package com.draazy.api.catalog.property;

public record TrustTally(
        Long totalListings,
        Long verifiedListings,
        Long verifiedOwners) {
}
