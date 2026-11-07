package com.draazy.api.catalog.managed;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

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
        LocalDate leaseEnd,
        Long deposit,
        String landlordPan,
        String policeIntimation,
        List<String> rentClaims,
        String firstRentMonth,
        Map<String, Object> valuation,
        String publishedListingId,
        String sourceRoomId,
        Instant createdAt,
        Instant updatedAt,
        boolean agreementVerified) {
}
