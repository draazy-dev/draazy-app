package com.draazy.api.admin;

import java.math.BigDecimal;

public record PricingInsightRow(
        String slug,
        String name,
        Long avgActualRatePerSqft,
        Long avgRent,
        BigDecimal rentalYieldPct,
        long buyCount,
        long rentCount,
        long totalListings) {
}