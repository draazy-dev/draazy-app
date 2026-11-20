package com.draazy.api.moderation.user;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserTimelineEntry(
        String kind,
        String entityId,
        Instant at,
        String label,
        String status) {
}
