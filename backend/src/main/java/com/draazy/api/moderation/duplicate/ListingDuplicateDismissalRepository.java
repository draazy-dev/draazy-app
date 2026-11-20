package com.draazy.api.moderation.duplicate;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ListingDuplicateDismissalRepository
        extends JpaRepository<ListingDuplicateDismissal, UUID> {
    List<ListingDuplicateDismissal> findByClusterSignatureIn(Collection<String> signatures);

    Optional<ListingDuplicateDismissal> findByClusterSignature(String signature);
}
