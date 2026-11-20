package com.draazy.api.catalog.society;

import java.math.BigDecimal;
import java.util.List;

public record SocietyDetailResponse(
        String slug,
        String name,
        String builder,
        String localitySlug,
        Double lat,
        Double lng,
        String placeId,
        Integer year,
        Integer towers,
        Integer units,
        BigDecimal occupancy,
        BigDecimal maintenancePerSqft,
        BigDecimal parkingRatio,
        Integer lifts,
        String security,
        String water,
        String power,
        String petPolicy,
        String vegPolicy,
        String rera,
        List<String> amenities,
        long listingCount,
        long forSale,
        long forRent,
        Long psf,
        Long rentAvg,
        List<SocietyHome> homes) {
}