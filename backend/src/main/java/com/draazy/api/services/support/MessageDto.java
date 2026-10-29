package com.draazy.api.services.support;

import java.time.Instant;

public record MessageDto(
        String id,
        String author,
        String authorRole,
        String body,
        Instant createdAt) {
}
