package com.draazy.api.engagement.search;

import java.time.Instant;

public record SavedSearchResponse(
        String id,
        String name,
        String kind,
        String query,
        Object filters,
        Object criteria,
        String label,
        String alertFrequency,
        String channel,
        int newCount,
        int matchCount,
        Instant createdAt) {
    SavedSearchResponse withMatchCount(int count) {
        return new SavedSearchResponse(id, name, kind, query, filters, criteria, label,
                alertFrequency, AlertChannels.PUSH, newCount, count, createdAt);
    }
}
