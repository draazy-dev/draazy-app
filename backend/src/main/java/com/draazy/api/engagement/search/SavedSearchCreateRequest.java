package com.draazy.api.engagement.search;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Pattern;

public record SavedSearchCreateRequest(
        String name,
        String kind,
        String query,
        Object filters,
        Object criteria,
        @Pattern(regexp = AlertFrequencies.PATTERN, message = AlertFrequencies.PATTERN_MESSAGE)
        String alertFrequency,
        @Pattern(regexp = AlertChannels.PATTERN, message = AlertChannels.PATTERN_MESSAGE)
        String channel) {
    @AssertTrue(message = "a listings alert needs a query")
    public boolean isQuerySuppliedForListings() {
        return isFlatmates() || (query != null && !query.isBlank());
    }

    @AssertTrue(message = "a flatmates alert needs criteria")
    public boolean isCriteriaSuppliedForFlatmates() {
        return !isFlatmates() || criteria != null;
    }

    boolean isFlatmates() {
        return "flatmates".equals(kind == null ? null : kind.strip());
    }
}
