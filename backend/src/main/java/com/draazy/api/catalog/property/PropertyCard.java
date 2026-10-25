package com.draazy.api.catalog.property;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.util.List;

/** Photo tile for home and dashboard rails: only what it draws, including the first {@link #MAX_PHOTOS} photos
 * it swipes through. The grid reads {@link PropertySummary}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PropertyCard(
        String id,
        String slug,
        String title,
        String deal,
        String propertyType,
        BigDecimal bhk,
        Long price,
        BigDecimal area,
        String locality,
        String city,
        String coverImage,
        List<String> images,
        boolean ownerVerified,
        boolean ownershipVerified) {

    public static final int MAX_PHOTOS = 5;
}
