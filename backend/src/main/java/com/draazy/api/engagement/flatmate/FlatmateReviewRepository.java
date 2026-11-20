package com.draazy.api.engagement.flatmate;

import java.time.Instant;
import java.time.LocalDate;
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

public interface FlatmateReviewRepository extends JpaRepository<FlatmateReview, UUID> {
    String POST_NOT_ARCHIVED =
            "and not exists (select 1 from FlatmateRoom fr where fr.id = r.roomId and fr.archived = true) "
            + "and not exists (select 1 from FlatmateGroup fg where fg.id = r.groupId and fg.archived = true)";

    String QUEUE_WHERE = "from FlatmateReview r where (:status is null or r.status = :status) "
            + "and (:flagged is null or r.flagForReview = :flagged) " + POST_NOT_ARCHIVED;

    @Query(value = "select r.id as id, r.kind as kind, r.roomId as roomId, r.groupId as groupId, "
            + "r.hostId as hostId, r.address as address, r.tier as tier, r.flagForReview as flagForReview, "
            + "r.evidenceType as evidenceType, "
            + "r.ownerConsent as ownerConsent, r.createdAt as createdAt " + QUEUE_WHERE,
            countQuery = "select count(r) " + QUEUE_WHERE)
    Page<QueueRow> findForQueue(@Param("status") String status,
            @Param("flagged") Boolean flagged, Pageable pageable);

    interface QueueRow {
        UUID getId();

        String getKind();

        UUID getRoomId();

        UUID getGroupId();

        UUID getHostId();

        String getAddress();

        String getTier();

        String getEvidenceType();

        boolean getFlagForReview();

        boolean getOwnerConsent();

        Instant getCreatedAt();
    }

    @Query("select count(r) from FlatmateReview r where r.status = 'pending' " + POST_NOT_ARCHIVED)
    long countPendingClaims();

    Optional<FlatmateReview> findByRoomId(UUID roomId);

    Optional<FlatmateReview> findByGroupId(UUID groupId);

    List<FlatmateReview> findByGroupIdIn(Collection<UUID> groupIds);

    List<FlatmateReview> findByRoomIdIn(Collection<UUID> roomIds);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update FlatmateReview r set r.ownerConsent = true "
            + "where (r.roomId = :postId or r.groupId = :postId) and r.status = 'pending'")
    int markOwnerConsent(@Param("postId") UUID postId);

    @Query("select r from FlatmateReview r "
            + "where r.status = 'approved' and r.agreement.validTill < :on " + POST_NOT_ARCHIVED)
    List<FlatmateReview> findLapsedApprovals(@Param("on") LocalDate on);

    @Query("select r from FlatmateReview r "
            + "where r.status = 'pending' and r.tier = 'tenant' and r.ownerConsent = true " + POST_NOT_ARCHIVED)
    List<FlatmateReview> findConsentedTenantBacklog();
}
