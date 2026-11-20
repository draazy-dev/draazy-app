package com.draazy.api.documents.vault;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ManagedPropertyDocumentRepository
        extends JpaRepository<ManagedPropertyDocument, UUID> {
    List<ManagedPropertyDocument> findByManagedPropertyIdOrderByUploadedAtDescIdDesc(
            UUID managedPropertyId);
}
