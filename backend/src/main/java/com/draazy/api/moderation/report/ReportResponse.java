package com.draazy.api.moderation.report;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

public record ReportResponse(
        String id,
        String targetType,
        String targetId,
        @JsonInclude(JsonInclude.Include.NON_NULL) String targetTitle,
        String reason,
        String details,
        String status,
        Instant createdAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) Long targetReportCount,
        @JsonInclude(JsonInclude.Include.NON_NULL) String targetName,
        @JsonInclude(JsonInclude.Include.NON_NULL) String targetMobile) {
    ReportResponse withTargetReportCount(long count) {
        return new ReportResponse(id, targetType, targetId, targetTitle, reason, details, status, createdAt, count,
                targetName, targetMobile);
    }

    ReportResponse withTargetTitle(String title) {
        return new ReportResponse(id, targetType, targetId, title, reason, details, status, createdAt,
                targetReportCount, targetName, targetMobile);
    }

    ReportResponse withTargetPerson(String name, String mobile) {
        return new ReportResponse(id, targetType, targetId, targetTitle, reason, details, status, createdAt,
                targetReportCount, name, mobile);
    }
}
