package com.draazy.api.deals.offer;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record OfferDto(
        String id,
        String propertyId,
        Party from,
        long amount,
        String status,
        String message,
        Instant createdAt,
        LocalDate moveIn,
        List<HistoryEntry> history) {
    public record Party(String id, String name, String mobile, String role, boolean verified) {
    }

    public record HistoryEntry(long amount, String by, Instant at) {
    }
}
