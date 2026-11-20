package com.draazy.api.leads.notes;

import java.time.Instant;

public record LeadNoteResponse(
        String leadKey,
        String note,
        Instant followUpAt,
        Instant updatedAt) {
    static LeadNoteResponse of(LeadNote row) {
        return new LeadNoteResponse(
                row.getLeadKey(), row.getNote(), row.getFollowUpAt(), row.getUpdatedAt());
    }
}
