package com.draazy.api.moderation.errorlog;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record ErrorEventDetail(
        UUID id,
        String fingerprint,
        String source,
        String level,
        String errorType,
        String message,
        String stack,
        String path,
        String httpMethod,
        Integer httpStatus,
        String build,
        String userRole,
        UUID lastUserId,
        String lastTraceId,
        Map<String, Object> context,
        int occurrences,
        Instant firstSeen,
        Instant lastSeen,
        Instant resolvedAt,
        UUID resolvedBy) {
}
