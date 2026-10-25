package com.draazy.api.engagement.requests;

import java.time.Instant;
import java.util.UUID;

/** One row of the requests inbox (contract {@code RequestItem}). The party never carries a mobile. */
public record RequestItem(
        UUID id,
        String kind,
        String state,
        String status,
        Party party,
        Target target,
        String message,
        Instant slot,
        String share,
        Instant createdAt,
        Instant decidedAt,
        Reminders reminders) {

    public record Party(UUID id, String name, boolean verified) {
    }

    public record Target(UUID id, String type, String title, String link) {
    }

    public record Reminders(long count, Instant lastAt, Instant nextAt) {
    }
}
