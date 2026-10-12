package com.draazy.api.deals.deal;

import com.draazy.api.catalog.property.AvailableOn;
import jakarta.validation.constraints.Pattern;

public record DealReopenRequest(
        @Pattern(regexp = AvailableOn.PATTERN, message = AvailableOn.PATTERN_MESSAGE) String availableOn) {
}
