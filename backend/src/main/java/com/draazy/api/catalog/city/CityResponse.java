package com.draazy.api.catalog.city;

public record CityResponse(
        String slug,
        String name,
        boolean live,
        long listingCount) {
}
