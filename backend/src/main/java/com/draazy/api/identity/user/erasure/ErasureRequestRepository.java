package com.draazy.api.identity.user.erasure;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ErasureRequestRepository extends JpaRepository<ErasureRequest, UUID> {
    Optional<ErasureRequest> findBySubjectIdAndStatus(UUID subjectId, String status);

    Page<ErasureRequest> findBySubjectIdOrderByRequestedAtDesc(UUID subjectId, Pageable pageable);

    @Query("select r from ErasureRequest r where (:status is null or r.status = :status) "
            + "and r.requestedAt >= :since order by r.requestedAt desc")
    Page<ErasureRequest> queue(@Param("status") String status, @Param("since") Instant since,
            Pageable pageable);

    // Row-locked so a second concurrent decision waits, then sees the first's outcome and gets the 409.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from ErasureRequest r where r.id = :id")
    Optional<ErasureRequest> findForDecision(@Param("id") UUID id);
}
