package com.draazy.api.catalog.property;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SearchIndexEntry(
        String deal,
        String locality,
        String localitySlug,
        String societySlug,
        String societyName,
        Double lat,
        Double lng) {
}
