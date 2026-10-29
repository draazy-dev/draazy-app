package com.draazy.api.moderation.enquiry;

import java.time.Instant;

public record AdminVisitDto(
        String id,
        String propertyId,
        String propertyTitle,
        String locality,
        String visitorName,
        String visitorMobile,
        Instant slot,
        String mode,
        String status,
        Instant createdAt) {
}
