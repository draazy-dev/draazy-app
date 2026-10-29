package com.draazy.api.catalog.society;

public record SocietyDuplicateSuggestion(
        String slug,
        String name,
        String localitySlug,
        double score) {
}
