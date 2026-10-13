package com.draazy.api.moderation.errorlog;

import java.time.Instant;
import java.util.UUID;

public record ErrorEventSummary(
        UUID id,
        String source,
        String errorType,
        String message,
        String path,
        int occurrences,
        Instant firstSeen,
        Instant lastSeen,
        String lastTraceId,
        Instant resolvedAt) {
}
