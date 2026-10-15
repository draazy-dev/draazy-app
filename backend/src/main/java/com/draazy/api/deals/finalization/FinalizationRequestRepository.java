package com.draazy.api.deals.finalization;

import jakarta.persistence.LockModeType;
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

/** Access to {@code finalization_requests}; list reads batch-load users rather than lazy associations. */
public interface FinalizationRequestRepository extends JpaRepository<FinalizationRequest, UUID> {

    /** Row-locked read for accept/decline, so a concurrent second tap waits and then sees the committed status. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select fr from FinalizationRequest fr where fr.id = :id")
    Optional<FinalizationRequest> findByIdForUpdate(@Param("id") UUID id);

    /** Service pre-check for the duplicate-prevention message (backed by the partial unique index). */
    @Query("select fr from FinalizationRequest fr " +
           "where fr.initiatorId = :initiatorId and fr.propertyId = :propertyId " +
           "and fr.status = 'pending'")
    Optional<FinalizationRequest> findLiveByInitiatorAndProperty(
            @Param("initiatorId") UUID initiatorId,
            @Param("propertyId") UUID propertyId);

    /** The caller-relevant live request for a property (where they are initiator or counterparty). */
    @Query("select fr from FinalizationRequest fr " +
           "where fr.propertyId = :propertyId and fr.status = 'pending' " +
           "and (fr.initiatorId = :callerId or fr.counterpartyId = :callerId)")
    Optional<FinalizationRequest> findLiveByPropertyAndParticipant(
            @Param("propertyId") UUID propertyId,
            @Param("callerId") UUID callerId);

    /** The caller's newest request on a property in any status, so a declined one differs from never asking. */
    @Query("select fr from FinalizationRequest fr " +
           "where fr.propertyId = :propertyId " +
           "and (fr.initiatorId = :callerId or fr.counterpartyId = :callerId) " +
           "order by fr.createdAt desc")
    List<FinalizationRequest> findRecentByPropertyAndParticipant(
            @Param("propertyId") UUID propertyId,
            @Param("callerId") UUID callerId,
            Pageable pageable);

    /** Pending requests awaiting the counterparty, newest first; the explicit count query avoids a derived one. */
    @Query(value = "select fr from FinalizationRequest fr "
                 + "where fr.counterpartyId = :counterpartyId and fr.status = 'pending' "
                 + "order by fr.createdAt desc",
           countQuery = "select count(fr) from FinalizationRequest fr "
                      + "where fr.counterpartyId = :counterpartyId and fr.status = 'pending'")
    Page<FinalizationRequest> findPendingByCounterparty(
            @Param("counterpartyId") UUID counterpartyId,
            Pageable pageable);

    /** Declines every other pending request on the property, in the same transaction as the accept. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update FinalizationRequest fr set fr.status = 'declined' " +
           "where fr.propertyId = :propertyId and fr.status = 'pending' " +
           "and fr.id <> :excludeId")
    int declineSiblings(@Param("propertyId") UUID propertyId, @Param("excludeId") UUID excludeId);
}
