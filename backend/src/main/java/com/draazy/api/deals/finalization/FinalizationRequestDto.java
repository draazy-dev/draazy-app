package com.draazy.api.deals.finalization;

import java.time.Instant;

public record FinalizationRequestDto(
        String id,
        String propertyId,
        Party initiator,
        Party counterparty,
        long agreedPrice,
        String status,
        Instant createdAt) {
    public record Party(String id, String name, String mobile, String role, boolean verified) {
    }
}
