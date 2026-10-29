package com.draazy.api.moderation.audit;

import com.draazy.api.common.audit.AuditLog;
import java.time.Instant;
import java.util.Map;

public record AuditEntryResponse(
        String id,
        String actor,
        String actorName,
        String actorRole,
        String action,
        String entity,
        String entityId,
        String checker,
        Instant at,
        Map<String, Object> metadata) {
}
