package com.draazy.api.moderation.report;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReportCreateRequest(
        @NotBlank String targetType,
        @NotBlank @Size(max = 200) String targetId,
        @NotBlank @Size(max = 64) String reason,
        @Size(max = 4000) String details) {
}
