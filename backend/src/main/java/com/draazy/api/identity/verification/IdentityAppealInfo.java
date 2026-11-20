package com.draazy.api.identity.verification;

import java.time.Instant;
import java.util.UUID;

public record IdentityAppealInfo(UUID id, String status, String note, UUID ticketId, Instant openedAt,
        Instant decidedAt) {

    public static IdentityAppealInfo of(IdentityAppeal a) {
        return new IdentityAppealInfo(a.getId(), a.getStatus(), a.getNote(), a.getTicketId(), a.getCreatedAt(),
                a.getDecidedAt());
    }
}
