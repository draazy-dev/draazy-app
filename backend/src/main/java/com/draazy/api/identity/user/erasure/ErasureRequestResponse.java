package com.draazy.api.identity.user.erasure;

import java.time.Instant;

public record ErasureRequestResponse(
        String id,
        String subjectDigest,
        String status,
        String reason,
        Instant requestedAt,
        Instant decidedAt,
        String decisionNote,
        String erased,
        String retained) {
    private static final String EMPTY_DOCUMENT = "{}";

    public static ErasureRequestResponse of(ErasureRequest request) {
        return new ErasureRequestResponse(
                request.getId().toString(),
                request.getSubjectDigest(),
                request.getStatus(),
                request.getReason(),
                request.getRequestedAt(),
                request.getDecidedAt(),
                request.getDecisionNote(),
                blankDocumentToNull(request.getErased()),
                blankDocumentToNull(request.getRetained()));
    }

    private static String blankDocumentToNull(String document) {
        return (document == null || EMPTY_DOCUMENT.equals(document)) ? null : document;
    }
}
