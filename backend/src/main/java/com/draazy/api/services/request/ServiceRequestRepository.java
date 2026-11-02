package com.draazy.api.services.request;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface ServiceRequestRepository extends JpaRepository<ServiceRequest, UUID> {
    @Query("""
            select r from ServiceRequest r
            where (r.requesterId = :requesterId
                   or exists (select 1 from ServiceRequestParty p
                              where p.requestId = r.id
                                and p.userId = :requesterId
                                and p.status = 'accepted'))
              and (:type is null or r.type = :type)
              and (:status is null or r.status = :status)
              and (:ticketId is null or r.ticketId = :ticketId)
            order by r.createdAt desc
            """)
    Page<ServiceRequest> findForRequester(@Param("requesterId") UUID requesterId,
            @Param("type") String type,
            @Param("status") ServiceRequestStatus status,
            @Param("ticketId") UUID ticketId,
            Pageable pageable);

    @Query("""
            select count(r) > 0 from ServiceRequest r
            where r.id = :id
              and (r.requesterId = :userId
                   or exists (select 1 from ServiceRequestParty p
                              where p.requestId = r.id
                                and p.userId = :userId
                                and p.status = 'accepted'))
            """)
    boolean isParticipant(@Param("id") UUID id, @Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r from ServiceRequest r
            where r.id = :id
            """)
    Optional<ServiceRequest> findByIdForUpdate(@Param("id") UUID id);

    @Query(value = "select id from users where id = :id for update", nativeQuery = true)
    Optional<UUID> lockUser(@Param("id") UUID id);

    @Query("""
            select count(r) from ServiceRequest r
            where r.requesterId = :userId
              and r.referralCredit = true
              and r.status <> com.draazy.api.services.request.ServiceRequestStatus.CANCELLED
            """)
    long countReferralCreditsHeld(@Param("userId") UUID userId);

    @Query("""
            select r from ServiceRequest r
            where r.status <> com.draazy.api.services.request.ServiceRequestStatus.AWAITING_PAYMENT
              and (:allTeams = true or r.team in :teams)
              and (:type is null or r.type = :type)
              and (:anyStatus = true or r.status in :statuses)
              and (:ticketId is null or r.ticketId = :ticketId)
              and (:unassigned = false or r.assigneeId is null)
              and (:mine = false or r.assigneeId = :assigneeId)
              and (:overdue = false
                   or (r.type = 'rent-agreement'
                       and ((r.status = com.draazy.api.services.request.ServiceRequestStatus.NEW
                             and r.statusChangedAt < :pickupBy)
                            or (r.status in (com.draazy.api.services.request.ServiceRequestStatus.ASSIGNED,
                                             com.draazy.api.services.request.ServiceRequestStatus.IN_PROGRESS)
                                and r.statusChangedAt < :draftBy)
                            or (r.status = com.draazy.api.services.request.ServiceRequestStatus.CHANGES_REQUESTED
                                and r.statusChangedAt < :revisionBy)
                            or (r.status = com.draazy.api.services.request.ServiceRequestStatus.APPROVED
                                and r.statusChangedAt < :registrationBy)))
                   and r.id not in :waitingIds)
              and (:prefix is null
                   or (:requestId is not null and r.id = :requestId)
                   or exists (select 1 from User u
                              where u.id = r.requesterId
                                and (lower(u.name) like :prefix escape '\\'
                                     or u.mobile like :prefix escape '\\')))
              and r.createdAt >= :since
            order by r.createdAt desc
            """)
    Page<ServiceRequest> findForQueue(@Param("allTeams") boolean allTeams,
            @Param("teams") List<String> teams,
            @Param("type") String type,
            @Param("anyStatus") boolean anyStatus,
            @Param("statuses") List<ServiceRequestStatus> statuses,
            @Param("ticketId") UUID ticketId,
            @Param("unassigned") boolean unassigned,
            @Param("mine") boolean mine,
            @Param("assigneeId") UUID assigneeId,
            @Param("overdue") boolean overdue,
            @Param("pickupBy") Instant pickupBy,
            @Param("draftBy") Instant draftBy,
            @Param("revisionBy") Instant revisionBy,
            @Param("registrationBy") Instant registrationBy,
            @Param("waitingIds") List<UUID> waitingIds,
            @Param("prefix") String prefix,
            @Param("requestId") UUID requestId,
            @Param("since") Instant since,
            Pageable pageable);

    @Query("""
            select r.status as status, count(r) as total
            from ServiceRequest r
            where r.status <> com.draazy.api.services.request.ServiceRequestStatus.AWAITING_PAYMENT
              and (:allTeams = true or r.team in :teams)
            group by r.status
            """)
    List<StatusTotal> countQueueByStatus(@Param("allTeams") boolean allTeams,
            @Param("teams") List<String> teams);

    @Query("""
            select count(r) from ServiceRequest r
            where r.status <> com.draazy.api.services.request.ServiceRequestStatus.AWAITING_PAYMENT
              and (:allTeams = true or r.team in :teams)
              and r.assigneeId = :assigneeId
              and r.status in :statuses
            """)
    long countMineForQueue(@Param("allTeams") boolean allTeams,
            @Param("teams") List<String> teams,
            @Param("assigneeId") UUID assigneeId,
            @Param("statuses") List<ServiceRequestStatus> statuses);

    @Query("""
            select count(r) from ServiceRequest r
            where r.status <> com.draazy.api.services.request.ServiceRequestStatus.AWAITING_PAYMENT
              and (:allTeams = true or r.team in :teams)
              and r.type = 'rent-agreement'
              and ((r.status = com.draazy.api.services.request.ServiceRequestStatus.NEW
                    and r.statusChangedAt < :pickupBy)
                   or (r.status in (com.draazy.api.services.request.ServiceRequestStatus.ASSIGNED,
                                    com.draazy.api.services.request.ServiceRequestStatus.IN_PROGRESS)
                       and r.statusChangedAt < :draftBy)
                   or (r.status = com.draazy.api.services.request.ServiceRequestStatus.CHANGES_REQUESTED
                       and r.statusChangedAt < :revisionBy)
                   or (r.status = com.draazy.api.services.request.ServiceRequestStatus.APPROVED
                       and r.statusChangedAt < :registrationBy))
            """)
    long countOverdueForQueue(@Param("allTeams") boolean allTeams,
            @Param("teams") List<String> teams,
            @Param("pickupBy") Instant pickupBy,
            @Param("draftBy") Instant draftBy,
            @Param("revisionBy") Instant revisionBy,
            @Param("registrationBy") Instant registrationBy);

    @Query(value = """
            select r.* from service_requests r
            where (:allTeams = true or r.team in (:teams))
              and r.type = 'rent-agreement'
              and ((r.status = 'new' and r.status_changed_at < :pickupBy)
                   or (r.status in ('assigned', 'in-progress') and r.status_changed_at < :draftBy))
              and r.details -> '_state' ->> 'tenantMode' = 'invite'
              and coalesce(r.details -> '_state' ->> 'ownerMode', '') <> 'invite'
            """, nativeQuery = true)
    List<ServiceRequest> findTenantInvitesBeforeDraft(@Param("allTeams") boolean allTeams,
            @Param("teams") List<String> teams,
            @Param("pickupBy") Instant pickupBy,
            @Param("draftBy") Instant draftBy);

    interface StatusTotal {
        ServiceRequestStatus getStatus();

        Long getTotal();
    }

    Optional<ServiceRequest> findByPaymentRef(String paymentRef);

    @Query(value = """
            select count(*) from service_requests r
            where r.requester_id = :requesterId and r.type = :type and r.status = 'awaiting-payment'
              and coalesce(rent_agreement_flat_key(r.details), '') = :flat
            """, nativeQuery = true)
    long countOpenUnpaidOnFlat(@Param("requesterId") UUID requesterId, @Param("type") String type,
            @Param("flat") String flat);

    @Query("""
            select r from ServiceRequest r
            where r.type = :type and r.paymentRef is not null
              and (r.requesterId = :userId or r.payerId = :userId)
            """)
    List<ServiceRequest> findWithOrderInvolving(@Param("userId") UUID userId, @Param("type") String type);

    @Query("""
            select r from ServiceRequest r
            where r.status = :status
              and ((r.paymentRef is not null and r.updatedAt < :cutoff)
                or (r.paymentRef is null and r.updatedAt < :incompleteCutoff))
            order by r.updatedAt asc
            """)
    List<ServiceRequest> findStaleByStatus(@Param("status") ServiceRequestStatus status,
            @Param("cutoff") Instant cutoff, @Param("incompleteCutoff") Instant incompleteCutoff,
            Limit batch);

    @Query(value = """
            select r.* from service_requests r
            where r.type = 'rent-agreement' and r.id <> :id
              and r.status not in ('awaiting-payment', 'cancelled')
              and ((cast(:propertyId as uuid) is not null and r.property_id = cast(:propertyId as uuid))
                or (cast(:flat as text) is not null
                  and rent_agreement_flat_key(r.details) = cast(:flat as text)))
            order by r.created_at asc
            limit 50
            """, nativeQuery = true)
    List<ServiceRequest> findRentAgreementsOnFlat(@Param("id") UUID id,
            @Param("propertyId") String propertyId, @Param("flat") String flat);
}
