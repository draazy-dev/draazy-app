package com.draazy.api.engagement.notification;

import java.time.Instant;

public record NotificationResponse(
        String id,
        String type,
        String title,
        String body,
        boolean read,
        String link,
        Instant createdAt) {
}
