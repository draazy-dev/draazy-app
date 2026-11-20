package com.draazy.api.documents.vault;

import com.draazy.api.common.trust.PersonalDocumentLookup;
import com.draazy.api.common.trust.PersonalDocumentView;
import com.draazy.api.provider.FileStorage;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class PersonalDocumentProofs implements PersonalDocumentLookup {
    private final PersonalDocumentRepository documents;
    private final FileStorage storage;

    PersonalDocumentProofs(PersonalDocumentRepository documents, FileStorage storage) {
        this.documents = documents;
        this.storage = storage;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isOwnedBy(UUID documentId, UUID ownerId) {
        return documentId != null && ownerId != null
                && documents.existsByIdAndOwnerId(documentId, ownerId);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PersonalDocumentView> viewOwnedBy(UUID documentId, UUID ownerId) {
        if (documentId == null || ownerId == null) {
            return Optional.empty();
        }
        // Owner is part of the query, not a check on a fetched row, so a missing owner filter cannot leak.
        return documents.findByIdAndOwnerId(documentId, ownerId)
                .map(d -> new PersonalDocumentView(
                        storage.signedDownloadUrl(d.getStorageKey()),
                        d.getFileName(),
                        d.getMimeType(),
                        d.getSizeBytes() == null ? 0L : d.getSizeBytes()));
    }
}
