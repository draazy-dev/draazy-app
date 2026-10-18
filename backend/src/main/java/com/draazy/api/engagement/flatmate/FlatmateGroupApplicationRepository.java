package com.draazy.api.engagement.flatmate;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FlatmateGroupApplicationRepository
        extends JpaRepository<FlatmateGroupApplication, UUID> {

    /** Uses the unfiltered created-at index so the admin board does not sort the full table. */
    Page<FlatmateGroupApplication> findByOrderByCreatedAtDesc(Pageable pageable);

    Page<FlatmateGroupApplication> findByModStatusIn(Collection<String> modStatuses, Pageable pageable);

    long countByModStatusIn(Collection<String> modStatuses);

    /** A query rather than the entity, so a staff take-down committed while waiting on the listing lock is seen. */
    boolean existsByIdAndModStatusIn(UUID id, Collection<String> modStatuses);

    @Query("select a.listingId from FlatmateGroupApplication a where a.id = :id")
    Optional<UUID> findListingId(@Param("id") UUID id);

    List<FlatmateGroupApplication> findByListingIdOrderByCreatedAtDesc(UUID listingId);

    /** {@code modStatus} hides removed spam while leaving owner-facing status pending. */
    Page<FlatmateGroupApplication> findByListingIdInAndModStatusInOrderByCreatedAtDesc(
            Collection<UUID> listingIds, Collection<String> modStatuses, Pageable pageable);

    Optional<FlatmateGroupApplication> findByListingIdAndGroupId(UUID listingId, UUID groupId);

    /** Callers pass the public moderation states: a removed application does not hold the flat. */
    boolean existsByListingIdAndStatusAndModStatusIn(UUID listingId, String status,
            Collection<String> modStatuses);

    boolean existsByListingIdAndStatusAndModStatusInAndIdNot(UUID listingId, String status,
            Collection<String> modStatuses, UUID id);

    List<FlatmateGroupApplication> findByListingIdAndStatus(UUID listingId, String status);

    @Query("""
            select a from FlatmateGroupApplication a
            where a.applicantId = :applicantId and a.modStatus in :modStatuses
              and (a.status = 'pending' or a.updatedAt >= :since)""")
    List<FlatmateGroupApplication> findSentSince(@Param("applicantId") UUID applicantId,
            @Param("modStatuses") Collection<String> modStatuses, @Param("since") Instant since);

    List<FlatmateGroupApplication> findByListingIdInAndStatusAndModStatusIn(Collection<UUID> listingIds,
            String status, Collection<String> modStatuses);

    Optional<FlatmateGroupApplication> findByIdAndApplicantId(UUID id, UUID applicantId);

    @Modifying
    @Query("delete from FlatmateGroupApplication a where a.applicantId = :userId and a.status = 'pending'")
    int deletePendingByApplicant(@Param("userId") UUID userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update FlatmateGroupApplication app
               set app.status = :status,
                   app.decidedAt = :decidedAt
             where app.id = :id
               and app.status = :pending
            """)
    int updateDecisionIfPending(@Param("id") UUID id,
                                @Param("pending") String pending,
                                @Param("status") String status,
                                @Param("decidedAt") java.time.Instant decidedAt);

    // created_at restarts so the reminder clock counts from the new application.
    @Modifying(flushAutomatically = true)
    @Query(value = "update flatmate_group_applications set created_at = now() where id = :id", nativeQuery = true)
    void restartClock(@Param("id") UUID id);
}
