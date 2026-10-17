package com.draazy.api.catalog.managed;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

/** No find-by-id on purpose: receipts are reached only through a property already proved to be the caller's. */
interface ManagedRentReceiptRepository extends JpaRepository<ManagedRentReceipt, UUID> {

    // A string sort is a month sort because V120's CHECK zero-pads rent_month.
    List<ManagedRentReceipt> findByManagedPropertyIdOrderByRentMonthDesc(UUID managedPropertyId, Limit limit);

    boolean existsByManagedPropertyIdAndRentMonth(UUID managedPropertyId, String rentMonth);

    List<ManagedRentReceipt> findByManagedPropertyIdAndCreatedAtGreaterThanEqualOrderByRentMonthDesc(
            UUID managedPropertyId, Instant since, Limit limit);
}
