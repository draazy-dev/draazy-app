package com.draazy.api.moderation.verification;

import java.time.Instant;
import java.util.List;

public record OwnershipVerificationResponse(
        String propertyId,
        boolean verified,
        Instant verifiedAt,
        Instant verifiedUntil,
        List<String> missingKinds,
        List<Evidence> evidence,
        Instant requestedAt,
        Instant declinedAt,
        String declinedReason,
        boolean ownerIdVerified) {
    public record Evidence(
            String id,
            String docType,
            String kind,
            String documentId,
            String subjectName,
            Instant issuedAt,
            Instant expiresAt,
            boolean current) {
    }
}
