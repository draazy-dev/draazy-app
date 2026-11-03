package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.trust.FlatmateCaseFiles;
import java.time.Instant;
import java.util.UUID;

public record FlatmateModerationRow(
        UUID id,
        String kind,
        String modStatus,
        String authorName,
        String authorMobile,
        String headline,
        String locality,
        String freeText,
        int photoCount,
        String coverPhoto,
        Long rent,
        String recheckReason,
        Instant recheckRequestedAt,
        Instant createdAt,
        boolean checklistRequired,
        String caseStatus,
        String caseReasonCode,
        int unreadFromHost) {
    static FlatmateModerationRow of(FlatmateModerationQueueDto item, FlatmateCaseFiles.CaseSummary summary) {
        return new FlatmateModerationRow(item.id(), item.kind(), item.modStatus(), item.authorName(),
                item.authorMobile(),
                item.headline(), item.locality(), item.freeText(), item.photos().size(),
                item.photos().isEmpty() ? null : item.photos().get(0), item.rent(),
                item.recheckReason(), item.recheckRequestedAt(), item.createdAt(),
                item.checklistRequired(), summary == null ? null : summary.status(),
                summary == null ? null : summary.reasonCode(),
                summary == null ? 0 : summary.unreadFromHost());
    }
}