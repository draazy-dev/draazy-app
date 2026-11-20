package com.draazy.api.deals.visit;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;

public record VisitCreateRequest(
        @NotBlank String propertyId,
        @NotNull @Future Instant slot,
        @Pattern(regexp = VisitModes.PATTERN) String mode,
        String note) {
}
