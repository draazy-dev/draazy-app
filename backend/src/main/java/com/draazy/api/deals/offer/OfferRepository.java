package com.draazy.api.deals.offer;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Reads over {@code offers}, shaped to hit the V5 and V47 indexes. */
public interface OfferRepository extends JpaRepository<Offer, UUID> {

    /** The caller's own offers, newest first; {@code idx_offers_from_created} carries the sort. */
    Page<Offer> findByFromUserIdOrderByCreatedAtDesc(UUID fromUserId, Pageable pageable);

    /** Offers against the caller's listings, newest first; hits {@code idx_offers_property_created}. */
    Page<Offer> findByPropertyIdInOrderByCreatedAtDesc(Collection<UUID> propertyIds,
                                                       Pageable pageable);

    /** Clean-error pre-check; {@code uq_offers_live_per_user_property} is the real guarantee. */
    @Query("select o from Offer o where o.fromUserId = :userId and o.propertyId = :propertyId " +
            "and o.status in ('pending', 'countered')")
    Optional<Offer> findLiveByUserAndProperty(@Param("userId") UUID userId,
                                               @Param("propertyId") UUID propertyId);

    Optional<Offer> findFirstByFromUserIdAndPropertyIdAndStatusOrderByCreatedAtDesc(
            UUID fromUserId, UUID propertyId, String status);
}
