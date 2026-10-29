package com.draazy.api.catalog.society;

import java.math.BigDecimal;

public record SocietyBrief(String slug, String name, String builder, Integer units, Integer towers, Integer year,
        BigDecimal occupancy, BigDecimal avgRating, long reviewCount) {
}