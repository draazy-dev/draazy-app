package com.draazy.api.moderation.enquiry;

import java.time.Instant;

public record AdminDealDto(
        String id,
        String propertyId,
        String propertyTitle,
        String locality,
        String deal,
        String counterpartyName,
        String counterpartyMobile,
        Long agreedPrice,
        String status,
        Instant closedAt,
        Instant createdAt) {
}
