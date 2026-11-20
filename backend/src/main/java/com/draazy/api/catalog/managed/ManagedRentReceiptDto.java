package com.draazy.api.catalog.managed;

import java.time.Instant;

public record ManagedRentReceiptDto(
        String id,
        String rentMonth,
        long amount,
        String tenantName,
        String landlordName,
        String propertyAddress,
        Instant createdAt) {
}
