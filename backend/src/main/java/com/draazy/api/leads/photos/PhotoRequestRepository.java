package com.draazy.api.leads.photos;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

// Finder shapes mirror the idempotency and owner-inbox indexes.
public interface PhotoRequestRepository extends JpaRepository<PhotoRequest, UUID> {

    Optional<PhotoRequest> findByRequesterIdAndPropertyId(UUID requesterId, UUID propertyId);

    // Takes property ids because photo requests do not store owner ids.
    Page<PhotoRequest> findByPropertyIdInAndStatusNotOrderByCreatedAtDesc(Collection<UUID> propertyIds, String status,
            Pageable pageable);

    Optional<PhotoRequest> findByIdAndRequesterId(UUID id, UUID requesterId);

    @Query("""
            select pr from PhotoRequest pr
            where pr.requesterId = :requesterId and (pr.status = 'pending' or pr.updatedAt >= :since)""")
    List<PhotoRequest> findSentSince(@Param("requesterId") UUID requesterId, @Param("since") Instant since);

    @Query("""
            select pr from PhotoRequest pr
            where pr.propertyId in :propertyIds and (pr.status = 'pending' or pr.updatedAt >= :since)""")
    List<PhotoRequest> findReceivedSince(@Param("propertyIds") Collection<UUID> propertyIds,
            @Param("since") Instant since);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select pr from PhotoRequest pr where pr.id = :id")
    Optional<PhotoRequest> lockById(@Param("id") UUID id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PhotoRequest pr set pr.status = 'withdrawn' "
            + "where pr.id = :id and pr.requesterId = :requesterId and pr.status = 'pending'")
    int withdrawIfPending(@Param("id") UUID id, @Param("requesterId") UUID requesterId);

    // created_at restarts so the reminder clock counts from the new ask, as contact's renewIfLapsed does.
    @Modifying(flushAutomatically = true)
    @Query(value = "update photo_requests set created_at = now() where id = :id", nativeQuery = true)
    void restartClock(@Param("id") UUID id);
}
