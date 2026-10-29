package com.draazy.api.engagement.search;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Pattern;

public record SavedSearchUpdateRequest(
        String name,
        String query,
        Object filters,
        @Pattern(regexp = AlertFrequencies.PATTERN, message = AlertFrequencies.PATTERN_MESSAGE)
        String alertFrequency,
        @Pattern(regexp = AlertChannels.PATTERN, message = AlertChannels.PATTERN_MESSAGE)
        String channel) {
    @AssertTrue(message = "new filters need a query")
    public boolean isQuerySuppliedWithFilters() {
        return filters == null || (query != null && !query.isBlank());
    }
}
