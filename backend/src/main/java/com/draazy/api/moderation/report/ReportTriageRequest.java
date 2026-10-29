package com.draazy.api.moderation.report;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReportTriageRequest(
        @NotBlank String status,
        @Size(max = 2000) String note,
        String enforcement) {
    public String enforcementOrNone() {
        return (enforcement == null || enforcement.isBlank()) ? ReportEnforcement.NONE : enforcement;
    }
}
