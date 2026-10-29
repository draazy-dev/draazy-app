package com.draazy.api.catalog.locality;

public record LocalityAdminRow(
        String slug,
        String name,
        Double lat,
        Double lng,
        boolean archived,
        long liveListings) {
}
