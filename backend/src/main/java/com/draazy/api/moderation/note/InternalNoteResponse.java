package com.draazy.api.moderation.note;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record InternalNoteResponse(
        String id,
        String entityType,
        String entityId,
        String authorId,
        String authorName,
        String action,
        String text,
        Instant createdAt,
        Instant updatedAt) {
}
