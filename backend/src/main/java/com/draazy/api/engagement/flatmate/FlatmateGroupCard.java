package com.draazy.api.engagement.flatmate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record FlatmateGroupCard(
        UUID id,
        String title,
        String locality,
        List<String> localities,
        Long rent,
        int seatsTotal,
        int seatsOpen,
        int memberCount,
        UUID propertyId,
        String modStatus,
        Instant createdAt,
        String hostRole,
        boolean hunting,
        String verificationTier,
        String reviewStatus) {
}
