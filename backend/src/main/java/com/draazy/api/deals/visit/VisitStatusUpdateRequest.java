package com.draazy.api.deals.visit;

import jakarta.validation.constraints.NotBlank;

public record VisitStatusUpdateRequest(
        @NotBlank String status,
        String note) {
}
