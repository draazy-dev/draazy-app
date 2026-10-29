package com.draazy.api.deals.deal;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DealRepository extends JpaRepository<Deal, UUID> {
    Optional<Deal> findByPropertyId(UUID propertyId);

    @Query("select d from Deal d where d.propertyId = :propertyId and d.status = 'closed'")
    Optional<Deal> findClosedByPropertyId(@Param("propertyId") UUID propertyId);

    Page<Deal> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<Deal> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);
}
