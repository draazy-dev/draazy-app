package com.draazy.api.documents.request;

import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;
import java.time.Instant;
import org.springframework.stereotype.Component;

// Requester mobile is always masked: granting documents must not also bypass the contact gate.
@Component
public class DocumentRequestMapper {
    public DocumentRequestDto toDto(DocumentRequest row, User requester, int sharedDocumentCount) {
        String status = projectedStatus(row);
        return new DocumentRequestDto(
                row.getId().toString(),
                row.getPropertyId().toString(),
                toParty(requester),
                row.getCategories(),
                status,
                sharedDocumentCount,
                row.getExpiresAt(),
                row.isAcknowledgedDisclaimer(),
                row.getCreatedAt());
    }

    public DocumentRequestDto toRequesterDto(
            DocumentRequest row, User requester, int sharedDocumentCount) {
        String status = projectedStatus(row);
        return new DocumentRequestDto(
                row.getId().toString(),
                row.getPropertyId().toString(),
                toParty(requester),
                row.getCategories(),
                status,
                DocumentRequestStatuses.GRANTED.equals(status) ? sharedDocumentCount : 0,
                row.getExpiresAt(),
                row.isAcknowledgedDisclaimer(),
                row.getCreatedAt());
    }

    private String projectedStatus(DocumentRequest row) {
        if (DocumentRequestStatuses.GRANTED.equals(row.getStatus())
                && row.getExpiresAt() != null && !row.getExpiresAt().isAfter(Instant.now())) {
            return DocumentRequestStatuses.EXPIRED;
        }
        return row.getStatus();
    }

    private DocumentRequestDto.Party toParty(User requester) {
        if (requester == null) {
            return null;
        }
        return new DocumentRequestDto.Party(requester.getId().toString(), requester.getName(),
                MobileMask.mask(requester.getMobile()), "buyer");
    }
}
