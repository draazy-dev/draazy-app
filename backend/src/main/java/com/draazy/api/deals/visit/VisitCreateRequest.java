package com.draazy.api.deals.visit;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;

/** Body of {@code POST /visits} and {@code POST /visit-requests}; they differ only in the caller (D3). */
public record VisitCreateRequest(
        @NotBlank String propertyId,
        @NotNull @Future Instant slot,
        @Pattern(regexp = VisitModes.PATTERN) String mode,
        String note) {
}
