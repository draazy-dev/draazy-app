package com.draazy.api.leads.contact;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ContactRequestRepository extends JpaRepository<ContactRequest, UUID> {
    Optional<ContactRequest> findByRequesterIdAndPropertyId(UUID requesterId, UUID propertyId);

    @Query("""
            select cr.propertyId as propertyId, cr.firstRequestedAt as firstRequestedAt, cr.status as status
            from ContactRequest cr where cr.requesterId = :requesterId
            and (cr.status = 'approved' or (cr.status = 'pending' and cr.createdAt >= :replyCutoff))""")
    List<CountedRequest> findCountedForQuota(@Param("requesterId") UUID requesterId,
            @Param("replyCutoff") Instant replyCutoff);

    interface CountedRequest {
        UUID getPropertyId();

        Instant getFirstRequestedAt();

        String getStatus();
    }

    @Query("""
            select count(cr) from ContactRequest cr
            where cr.propertyId = :propertyId and cr.enquiredAt >= :from and cr.enquiredAt < :to""")
    long countEnquiredBetween(@Param("propertyId") UUID propertyId, @Param("from") Instant from,
            @Param("to") Instant to);

    @Query("""
            select cr from ContactRequest cr
            where cr.status = 'pending' and cr.createdAt < :replyCutoff order by cr.createdAt""")
    List<ContactRequest> findOverduePending(@Param("replyCutoff") Instant replyCutoff, Limit limit);

    boolean existsByRequesterIdAndPropertyIdAndStatus(UUID requesterId, UUID propertyId, String status);

    @Query("""
            select cr.propertyId, cr.requesterId from ContactRequest cr
            where cr.propertyId in :propertyIds
              and cr.requesterId in :requesterIds
              and cr.status = :status
            """)
    List<Object[]> approvedRequestersForProperties(
            @Param("propertyIds") Collection<UUID> propertyIds,
            @Param("requesterIds") Collection<UUID> requesterIds,
                                   @Param("status") String status);

    @Query("""
            select cr.propertyId, count(cr) from ContactRequest cr
            where cr.propertyId in :propertyIds
              and cr.status = :status
              and cr.createdAt >= :liveSince
            group by cr.propertyId
            """)
    List<Object[]> countPendingByProperty(
            @Param("propertyIds") Collection<UUID> propertyIds,
            @Param("status") String status,
            @Param("liveSince") Instant liveSince);

    Page<ContactRequest> findByPropertyIdInOrderByCreatedAtDesc(Collection<UUID> propertyIds,
            Pageable pageable);

    Page<ContactRequest> findByPropertyIdInAndStatusNotOrderByCreatedAtDesc(Collection<UUID> propertyIds,
            String status, Pageable pageable);

    @Query("""
            select cr from ContactRequest cr
            where cr.requesterId = :requesterId and (cr.status = 'pending' or cr.updatedAt >= :since)""")
    List<ContactRequest> findSentSince(@Param("requesterId") UUID requesterId, @Param("since") Instant since);

    @Query("""
            select cr from ContactRequest cr
            where cr.propertyId in :propertyIds
              and ((cr.status = 'pending' and cr.createdAt >= :replyCutoff) or cr.updatedAt >= :since)""")
    List<ContactRequest> findReceivedSince(@Param("propertyIds") Collection<UUID> propertyIds,
            @Param("replyCutoff") Instant replyCutoff, @Param("since") Instant since);

    Optional<ContactRequest> findByIdAndRequesterId(UUID id, UUID requesterId);

    Page<ContactRequest> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<ContactRequest> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update ContactRequest cr
               set cr.status = :toStatus
             where cr.id = :id
               and cr.status = :fromStatus
            """)
    int updateStatusIfCurrent(@Param("id") UUID id,
                              @Param("fromStatus") String fromStatus,
                              @Param("toStatus") String toStatus);

    List<ContactRequest> findByPropertyIdAndStatus(UUID propertyId, String status);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            update contact_requests
               set status = 'pending', created_at = :now, first_requested_at = :now, message = :message
             where id = :id
               and (status in ('expired', 'withdrawn') or (status = 'pending' and created_at < :replyCutoff))
            """, nativeQuery = true)
    int renewIfLapsed(@Param("id") UUID id, @Param("message") String message, @Param("now") Instant now,
                      @Param("replyCutoff") Instant replyCutoff);

    @Query("""
            select count(cr) > 0 from ContactRequest cr
            where cr.requesterId = :requesterId
              and cr.status = :status
              and cr.propertyId in (select p.id from Property p where p.owner.id = :ownerId)
            """)
    boolean existsApprovedForOwner(@Param("requesterId") UUID requesterId,
                                   @Param("ownerId") UUID ownerId,
                                   @Param("status") String status);
}
