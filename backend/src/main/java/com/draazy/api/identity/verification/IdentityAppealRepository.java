package com.draazy.api.identity.verification;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface IdentityAppealRepository extends JpaRepository<IdentityAppeal, UUID> {

    Optional<IdentityAppeal> findFirstByVerificationIdOrderByCreatedAtDesc(UUID verificationId);

    Optional<IdentityAppeal> findByVerificationIdAndStatus(UUID verificationId, String status);

    long countByStatus(String status);

    @Query("select a.verificationId from IdentityAppeal a where a.status = 'open' and a.verificationId in :ids")
    List<UUID> openVerificationIds(Collection<UUID> ids);
}
