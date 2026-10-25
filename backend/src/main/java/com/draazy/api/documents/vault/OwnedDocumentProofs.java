package com.draazy.api.documents.vault;

import com.draazy.api.common.trust.OwnedDocumentLookup;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class OwnedDocumentProofs implements OwnedDocumentLookup {

    private final PersonalDocumentRepository personalDocuments;
    private final DocumentRepository documents;

    OwnedDocumentProofs(PersonalDocumentRepository personalDocuments, DocumentRepository documents) {
        this.personalDocuments = personalDocuments;
        this.documents = documents;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean ownsDocument(UUID userId, UUID documentId) {
        return userId != null && documentId != null
                && (personalDocuments.existsByIdAndOwnerId(documentId, userId)
                || documents.existsOwnedPropertyVaultDocument(documentId, userId));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<String> flatEvidenceType(UUID userId, UUID documentId) {
        if (userId == null || documentId == null) {
            return Optional.empty();
        }
        return personalDocuments.findByIdAndOwnerId(documentId, userId)
                .map(d -> d.getCategory() == null ? "" : d.getCategory().strip().toLowerCase(Locale.ROOT))
                .flatMap(category -> switch (category) {
                    case "rent agreement" -> Optional.of(RENT_AGREEMENT);
                    case "electricity bill" -> Optional.of(ELECTRICITY_BILL);
                    default -> Optional.<String>empty();
                });
    }
}
