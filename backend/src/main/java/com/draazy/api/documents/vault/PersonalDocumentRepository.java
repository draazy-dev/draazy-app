package com.draazy.api.documents.vault;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PersonalDocumentRepository extends JpaRepository<PersonalDocument, UUID> {
    List<PersonalDocument> findByOwnerIdOrderByUploadedAtDescIdDesc(UUID ownerId);

    // Both key halves required: existsById alone would reveal another user's document exists.
    boolean existsByIdAndOwnerId(UUID id, UUID ownerId);

    boolean existsByStorageKey(String storageKey);

    Optional<PersonalDocument> findByIdAndOwnerId(UUID id, UUID ownerId);

    @Query("select d from PersonalDocument d where lower(trim(d.category)) in :categories")
    List<PersonalDocument> findByCategories(Collection<String> categories);
}
