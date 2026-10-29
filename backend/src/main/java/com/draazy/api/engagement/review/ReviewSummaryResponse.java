package com.draazy.api.engagement.review;

import java.math.BigDecimal;
import java.util.Map;

public record ReviewSummaryResponse(
        BigDecimal avgRating,
        long reviewCount,
        Map<String, Long> distribution,
        Map<String, BigDecimal> categoryAverages) {
}
