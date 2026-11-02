package com.draazy.api.deals.offer;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OfferRepository extends JpaRepository<Offer, UUID> {
    Page<Offer> findByFromUserIdOrderByCreatedAtDesc(UUID fromUserId, Pageable pageable);

    Page<Offer> findByFromUserIdAndPropertyIdOrderByCreatedAtDesc(UUID fromUserId, UUID propertyId,
                                                                  Pageable pageable);

    Page<Offer> findByPropertyIdInOrderByCreatedAtDesc(Collection<UUID> propertyIds,
                                                       Pageable pageable);

    @Query("select o from Offer o where o.fromUserId = :userId and o.propertyId = :propertyId " +
            "and o.status in ('pending', 'countered')")
    Optional<Offer> findLiveByUserAndProperty(@Param("userId") UUID userId,
                                               @Param("propertyId") UUID propertyId);

    Optional<Offer> findFirstByFromUserIdAndPropertyIdAndStatusOrderByCreatedAtDesc(
            UUID fromUserId, UUID propertyId, String status);

    boolean existsByFromUserIdAndPropertyIdAndStatus(UUID fromUserId, UUID propertyId, String status);

    @Query("""
            select o from Offer o where o.fromUserId = :buyerId
            and (o.status in ('pending', 'countered') or o.updatedAt >= :since)""")
    List<Offer> findSentSince(@Param("buyerId") UUID buyerId, @Param("since") Instant since);

    @Query("""
            select o from Offer o where o.propertyId in :propertyIds
            and (o.status in ('pending', 'countered') or o.updatedAt >= :since)""")
    List<Offer> findReceivedSince(@Param("propertyIds") Collection<UUID> propertyIds, @Param("since") Instant since);
}
