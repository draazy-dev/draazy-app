package com.draazy.api.catalog.listing;

import jakarta.validation.constraints.Size;

public record ListingDuplicateCheck(
        @Size(max = 300) String address,
        String locality,
        String localitySlug,
        String city,
        Double lat,
        Double lng,
        @Size(max = 64) String electricityMeterNo) {
}
