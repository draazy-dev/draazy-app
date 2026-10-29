package com.draazy.api.services.request;

import java.time.Instant;

public record MessageDto(
        String id,
        String authorId,
        String author,
        String authorRole,
        String body,
        Instant createdAt,
        Instant readAt) {
}
