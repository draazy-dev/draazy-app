package com.draazy.api.admin.staff;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.Map;

public record StaffActivityEntry(
        String id,
        String actorName,
        String actorRole,
        String action,
        String entity,
        String entityId,
        Instant at,
        @JsonInclude(JsonInclude.Include.NON_NULL) Map<String, Object> metadata) {
}
