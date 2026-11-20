package com.draazy.api.moderation.verification;

import java.time.Instant;

public record ReviewBadge(
        String propertyId,
        String status,
        int unread,
        Instant updatedAt,
        String reasonCode,
        String reasonNote,
        String lastMessage) {
}
