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

// Finder shapes mirror the contact-request indexes, so inbox and reveal checks stay cheap.
public interface ContactRequestRepository extends JpaRepository<ContactRequest, UUID> {

    Optional<ContactRequest> findByRequesterIdAndPropertyId(UUID requesterId, UUID propertyId);

    // Counts while it has revealed the number or may still: approved, or pending inside the reply window. A projection,
    // since first_requested_at is database-written and a just-saved entity holds null. Read under CONTACT_REQUEST lock.
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

    // The mapper asks this on every detail render, so an existence check is enough.
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
            select cr.propertyId from ContactRequest cr
            where cr.requesterId = :requesterId
              and cr.propertyId in :propertyIds
              and cr.status = :status
            """)
    List<UUID> approvedPropertyIdsForRequester(
            @Param("requesterId") UUID requesterId,
            @Param("propertyIds") Collection<UUID> propertyIds,
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

    // Takes property ids because contact requests do not store owner ids.
    Page<ContactRequest> findByPropertyIdInOrderByCreatedAtDesc(Collection<UUID> propertyIds,
            Pageable pageable);

    Page<ContactRequest> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<ContactRequest> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    // This table owns the question, so the finance slice should not query it.
    @Query("""
            update ContactRequest cr
               set cr.status = :toStatus
             where cr.id = :id
               and cr.status = :fromStatus
            """)
    int updateStatusIfCurrent(@Param("id") UUID id,
                              @Param("fromStatus") String fromStatus,
                              @Param("toStatus") String toStatus);

    // Native: first_requested_at is database-written, so the entity maps it read-only.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            update contact_requests
               set status = 'pending', created_at = :now, first_requested_at = :now, message = :message
             where id = :id
               and (status = 'expired' or (status = 'pending' and created_at < :replyCutoff))
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
