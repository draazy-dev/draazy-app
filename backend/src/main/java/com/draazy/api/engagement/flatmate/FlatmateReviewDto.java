package com.draazy.api.engagement.flatmate;

import com.draazy.api.identity.user.User;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/** Contract schema {@code FlatmateReview}. Back-office only, so the host's mobile is in full. */
public record FlatmateReviewDto(
        UUID id,
        String kind,
        UUID roomId,
        UUID groupId,
        String host,
        String hostMobile,
        boolean hostVerified,
        String address,
        String tier,
        boolean flagForReview,
        boolean ownerConsent,
        Map<String, Object> agreementDoc,
        String evidenceType,
        LocalDate evidenceIssuedOn,
        Boolean nameMatches,
        Boolean addressMatches,
        LocalDate agreementValidTill,
        String status,
        String reason,
        Instant createdAt,
        Instant updatedAt) {

    static FlatmateReviewDto of(FlatmateReview review, User host) {
        return new FlatmateReviewDto(
                review.getId(),
                review.getKind(),
                review.getRoomId(),
                review.getGroupId(),
                host == null ? null : host.getName(),
                host == null ? null : host.getMobile(),
                host != null && host.isVerified(),
                review.getAddress(),
                review.getTier(),
                review.isFlagForReview(),
                review.isOwnerConsent(),
                review.getAgreementDoc(),
                review.getEvidenceType(),
                review.getEvidenceIssuedOn(),
                review.getNameMatches(),
                review.getAddressMatches(),
                review.getAgreement().getValidTill(),
                review.getStatus(),
                review.getReason(),
                review.getCreatedAt(),
                review.getUpdatedAt());
    }
}
