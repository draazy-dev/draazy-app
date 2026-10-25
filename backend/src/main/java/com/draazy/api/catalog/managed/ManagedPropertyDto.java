package com.draazy.api.catalog.managed;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

/** Wire source data, not a rendered card: the client derives price strings and the location line, and relabels
 * {@code buy} as {@code sale}. */
public record ManagedPropertyDto(
        String id,
        String title,
        String deal,
        String propertyType,
        BigDecimal bhk,
        Long price,
        String locality,
        String localitySlug,
        String society,
        BigDecimal area,
        String areaUnit,
        String furnishing,
        String visibility,
        String status,
        boolean rented,
        String tenantName,
        String tenantMobile,
        Long monthlyRent,
        Integer dueDay,
        Map<String, Object> valuation,
        String publishedListingId,
        String sourceRoomId,
        Instant createdAt,
        Instant updatedAt) {
}
