package com.draazy.api.deals.deal;

import java.time.Instant;

public record DealDto(
        String id,
        String propertyId,
        String deal,
        Party counterparty,
        Long agreedPrice,
        String status,
        Instant closedAt) {
    public record Party(String id, String name, String mobile, String role) {
    }
}
