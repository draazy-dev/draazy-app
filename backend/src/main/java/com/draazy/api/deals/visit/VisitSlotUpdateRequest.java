package com.draazy.api.deals.visit;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record VisitSlotUpdateRequest(
        @NotNull @Future Instant slot) {
}
