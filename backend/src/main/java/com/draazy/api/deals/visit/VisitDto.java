package com.draazy.api.deals.visit;

import java.time.Instant;

public record VisitDto(
        String id,
        String propertyId,
        String propertyTitle,
        String propertySlug,
        Party visitor,
        Instant slot,
        String mode,
        String status,
        Instant createdAt,
        String note) {
    public record Party(String id, String name, String mobile, String role) {
    }
}