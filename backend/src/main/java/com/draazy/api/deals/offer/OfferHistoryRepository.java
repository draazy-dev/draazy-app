package com.draazy.api.deals.offer;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferHistoryRepository extends JpaRepository<OfferHistory, UUID> {
    List<OfferHistory> findByOfferIdOrderByAtAsc(UUID offerId);

    List<OfferHistory> findByOfferIdInOrderByAtAsc(Collection<UUID> offerIds);
}
