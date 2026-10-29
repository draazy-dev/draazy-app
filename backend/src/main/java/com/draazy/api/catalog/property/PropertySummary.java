package com.draazy.api.catalog.property;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PropertySummary(
        String id,
        String slug,
        String title,
        String deal,
        String propertyType,
        BigDecimal bhk,
        Long price,

        Long deposit,
        BigDecimal area,
        String areaUnit,
        String furnishing,
        String possession,

        String landUse,

        String room,
        List<String> tenants,
        String availableFrom,
        LocalDate availableOn,
        Boolean pets,

        String locality,
        String localitySlug,
        String societyName,
        String city,
        Double lat,
        Double lng,
        String coverImage,
        boolean verified,
        boolean ownerVerified,
        boolean ownershipVerified,
        String reraId,
        String status,
        String dealStatus,

        boolean featured,
        Instant createdAt) {
}
