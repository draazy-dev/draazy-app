package com.draazy.api.moderation.verification;

import com.draazy.api.catalog.property.ListingProgress;
import com.draazy.api.moderation.signal.ListingSignals;
import java.time.Instant;
import java.util.List;

public record PropertyReviewResponse(
        String propertyId,
        String status,
        String propertyStatus,
        String reviewer,
        List<ChecklistEntry> checklist,
        List<MessageEntry> messages,
        String notes,
        String reasonCode,
        String reasonNote,
        ListingSignals signals,
        Instant decidedAt,
        ListingProgress progress,
        String reraCheck) {
    public record ChecklistEntry(String item, boolean pass) {
    }

    public record MessageEntry(String id, String from, String body, Instant at, boolean read,
            boolean internal, boolean clarificationRequested) {
    }
}
