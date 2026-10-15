package com.draazy.api.deals.visit;

import java.time.Instant;

// The visitor's mobile is masked to the owner until the visit is confirmed, so booking cannot harvest
// numbers; VisitService#visitorMobileVisibility is the one place that decides it.
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