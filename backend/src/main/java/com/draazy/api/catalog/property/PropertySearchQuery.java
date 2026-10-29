package com.draazy.api.catalog.property;

public record PropertySearchQuery(
        String deal,
        String type,
        String locality,
        Integer bhk,
        Long minPrice,
        Long maxPrice,
        String furnishing,
        String possession,
        String q,
        String status,
        String owner) {
}
