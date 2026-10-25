package com.draazy.api.engagement.flatmate;

import com.draazy.api.identity.user.User;
import java.time.Instant;
import java.util.UUID;

/** What a card on the verification desk shows. The agreement file is the popup's: a list of them
 * would carry up to 3 MB of base64 per row for cards that never render it. */
public record FlatmateReviewRow(
        UUID id,
        String kind,
        UUID roomId,
        UUID groupId,
        String host,
        String hostMobile,
        boolean hostVerified,
        String evidenceType,
        String address,
        String tier,
        boolean flagForReview,
        boolean ownerConsent,
        Instant createdAt) {

    static FlatmateReviewRow of(FlatmateReviewRepository.QueueRow r, User host) {
        return new FlatmateReviewRow(r.getId(), r.getKind(), r.getRoomId(), r.getGroupId(),
                host == null ? null : host.getName(), host == null ? null : host.getMobile(),
                host != null && host.isVerified(), r.getEvidenceType(), r.getAddress(), r.getTier(), r.getFlagForReview(), r.getOwnerConsent(), r.getCreatedAt());
    }
}