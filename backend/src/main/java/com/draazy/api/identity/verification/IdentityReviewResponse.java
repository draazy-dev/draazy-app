package com.draazy.api.identity.verification;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record IdentityReviewResponse(
        UUID id,
        UUID userId,
        String userName,
        String accountName,
        String accountEmail,
        String accountGender,
        String userMobile,
        String userRole,
        String status,
        String docType,
        Claims claims,
        String holderName,
        LocalDate holderDob,
        boolean holderDobYearOnly,
        String liveness,
        String livenessSource,
        String livenessChallenge,
        boolean numberOverridden,
        int attemptCount,
        Instant submittedAt,
        Instant decidedAt,
        String reviewerName,
        String approvedByName,
        String rejectionReason,
        String rejectionNote,
        Instant revokedAt,
        String revokedByName,
        String revocationReason,
        String claimedByName,
        boolean claimedByMe,
        Instant filesPurgedAt,
        Images images,
        List<Warning> warnings,
        IdentityAppealInfo appeal,
        boolean appealCanDecide,
        boolean appealCanReopen) {
    public record Claims(String number, String name, LocalDate dob) {
    }

    public record Images(String front, String back, String selfie) {
    }

    public record Warning(String kind, UUID userId, String userName, String userMobile, UUID reviewId) {
    }
}
