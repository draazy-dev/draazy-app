package com.draazy.api.catalog.locality;

public record LocalityResponse(
        String slug,
        String name,
        String city,
        Double lat,
        Double lng,
        boolean archived,
        long liveListings,
        boolean indexable,
        Long avgRent,
        Long ratePerSqft,
        Long fromPrice,
        long forSale,
        long forRent,
        Long fromSale,
        Long fromRent) {
}
