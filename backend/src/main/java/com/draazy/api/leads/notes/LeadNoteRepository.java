package com.draazy.api.leads.notes;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.Repository;

// Extends Repository, not JpaRepository, so no unscoped findById/findAll/deleteById exists;
// every read must name an owner.
public interface LeadNoteRepository extends Repository<LeadNote, UUID> {
    List<LeadNote> findByOwnerId(UUID ownerId);

    long countByOwnerId(UUID ownerId);

    Optional<LeadNote> findByOwnerIdAndLeadKey(UUID ownerId, String leadKey);

    LeadNote saveAndFlush(LeadNote note);

    void delete(LeadNote note);
}
