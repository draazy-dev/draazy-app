package com.draazy.api.catalog.managed;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ManagedPropertyRepository extends JpaRepository<ManagedProperty, UUID> {
    List<ManagedProperty> findByOwnerIdOrderByCreatedAtDescIdDesc(UUID ownerId);

    Optional<ManagedProperty> findByPublishedListingId(UUID publishedListingId);

    List<ManagedProperty> findByTenantMobileAndRentedTrueOrderByCreatedAtDescIdDesc(String tenantMobile);

    List<ManagedProperty> findByRentedTrueAndTenantMobileNotNull();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from ManagedProperty m where m.id = :id")
    Optional<ManagedProperty> findByIdForUpdate(@Param("id") UUID id);

    boolean existsByOwnerIdAndAddressFingerprint(UUID ownerId, String addressFingerprint);

    List<ManagedProperty> findByOwnerIdAndAddressFingerprintNotNullOrderByCreatedAtDescIdDesc(UUID ownerId);
}
