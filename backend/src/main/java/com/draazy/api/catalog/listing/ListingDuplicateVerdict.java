package com.draazy.api.catalog.listing;

public record ListingDuplicateVerdict(boolean found, String existingId) {
    static final ListingDuplicateVerdict NONE = new ListingDuplicateVerdict(false, null);
}
