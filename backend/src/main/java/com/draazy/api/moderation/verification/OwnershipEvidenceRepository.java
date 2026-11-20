package com.draazy.api.moderation.verification;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OwnershipEvidenceRepository extends JpaRepository<OwnershipEvidence, UUID> {
    List<OwnershipEvidence> findByPropertyIdOrderByIssuedAtDesc(UUID propertyId);

    Optional<OwnershipEvidence> findFirstByDocumentId(UUID documentId);
}
