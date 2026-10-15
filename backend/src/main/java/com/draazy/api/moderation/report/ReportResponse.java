package com.draazy.api.moderation.report;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/** Omits {@code reporterId} on purpose: naming the reporter to ops turns a complaint into a reprisal,
 * and no moderation decision depends on it. */
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

    /** Only {@code GET /reports} rows carry the tally of reports on the same target. */
    ReportResponse withTargetReportCount(long count) {
        return new ReportResponse(id, targetType, targetId, targetTitle, reason, details, status, createdAt, count,
                targetName, targetMobile);
    }

    ReportResponse withTargetTitle(String title) {
        return new ReportResponse(id, targetType, targetId, title, reason, details, status, createdAt,
                targetReportCount, targetName, targetMobile);
    }

    /** Only {@code GET /reports} rows against a person name them, so ops can tell who is being reported. */
    ReportResponse withTargetPerson(String name, String mobile) {
        return new ReportResponse(id, targetType, targetId, targetTitle, reason, details, status, createdAt,
                targetReportCount, name, mobile);
    }
}
