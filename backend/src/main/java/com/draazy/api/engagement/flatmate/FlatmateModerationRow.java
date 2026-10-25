package com.draazy.api.engagement.flatmate;

import java.time.Instant;
import java.util.UUID;

/** A card on the moderation desk: the queue item with only its first photo (the card's thumbnail)
 * and without the author's id. The popup reads the full {@link FlatmateModerationQueueDto}. */
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
        Instant createdAt) {

    static FlatmateModerationRow of(FlatmateModerationQueueDto item) {
        return new FlatmateModerationRow(item.id(), item.kind(), item.modStatus(), item.authorName(),
                item.authorMobile(),
                item.headline(), item.locality(), item.freeText(), item.photos().size(),
                item.photos().isEmpty() ? null : item.photos().get(0), item.rent(),
                item.recheckReason(), item.recheckRequestedAt(), item.createdAt());
    }
}