package com.draazy.api.catalog.society;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SocietyCard(String slug, String name, String localitySlug, long listingCount) {
}
