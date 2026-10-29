package com.draazy.api.engagement.flatmate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record FlatmateRoomCard(
        UUID id,
        String title,
        UUID propertyId,
        String society,
        String flatType,
        String locality,
        List<String> localities,
        Long budget,
        int shareMax,
        int occupants,
        String cover,
        String modStatus,
        String status,
        Instant createdAt,
        String hostRole,
        String verificationTier,
        String reviewStatus) {
}
