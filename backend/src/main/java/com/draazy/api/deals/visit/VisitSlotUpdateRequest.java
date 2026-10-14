package com.draazy.api.deals.visit;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

/** Body of {@code PATCH /visits/{id}/slot}; the service resets the visit to {@code scheduled} to re-confirm. */
public record VisitSlotUpdateRequest(
        @NotNull @Future Instant slot) {
}
