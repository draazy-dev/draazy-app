package com.draazy.api.catalog.managed;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

interface ManagedRentReceiptRepository extends JpaRepository<ManagedRentReceipt, UUID> {
    List<ManagedRentReceipt> findByManagedPropertyIdOrderByRentMonthDesc(UUID managedPropertyId, Limit limit);

    boolean existsByManagedPropertyIdAndRentMonth(UUID managedPropertyId, String rentMonth);

    List<ManagedRentReceipt> findByManagedPropertyIdAndCreatedAtGreaterThanEqualOrderByRentMonthDesc(
            UUID managedPropertyId, Instant since, Limit limit);
}
