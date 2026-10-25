package com.draazy.api.catalog.managed;

import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ManagedPropertyRepository extends JpaRepository<ManagedProperty, UUID> {

    /** The caller's own managed records, newest first (id tiebreaker for a deterministic order). */
    List<ManagedProperty> findByOwnerIdOrderByCreatedAtDescIdDesc(UUID ownerId);

    // Not owner-scoped on purpose: register only reads whether the listing is already adopted, never the record.
    Optional<ManagedProperty> findByPublishedListingId(UUID publishedListingId);

    List<ManagedProperty> findByTenantMobileAndRentedTrueOrderByCreatedAtDescIdDesc(String tenantMobile);

    List<ManagedProperty> findByRentedTrueAndTenantMobileNotNull();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from ManagedProperty m where m.id = :id")
    Optional<ManagedProperty> findByIdForUpdate(@Param("id") UUID id);

    boolean existsByOwnerIdAndAddressFingerprint(UUID ownerId, String addressFingerprint);

    List<ManagedProperty> findByOwnerIdAndAddressFingerprintNotNullOrderByCreatedAtDescIdDesc(UUID ownerId);

    /** One statement and no unique violation, so two rooms of one flat agreed together cannot abort the caller's
     * transaction; the nulls are cast because Hibernate binds an untyped null as bytea. */
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = """
            insert into managed_properties (owner_id, title, deal, property_type, bhk, price, locality,
                                            locality_slug, society, furnishing, source_room_id, address_fingerprint)
            values (:ownerId, :title, 'rent', :propertyType, cast(:bhk as numeric), 0, :locality,
                    cast(:localitySlug as text), cast(:society as text), cast(:furnishing as text),
                    :roomId, :fingerprint)
            on conflict (owner_id, address_fingerprint) where address_fingerprint is not null do nothing
            """)
    int insertFlatmateHome(@Param("ownerId") UUID ownerId, @Param("title") String title,
            @Param("propertyType") String propertyType, @Param("bhk") BigDecimal bhk,
            @Param("locality") String locality, @Param("localitySlug") String localitySlug,
            @Param("society") String society, @Param("furnishing") String furnishing,
            @Param("roomId") UUID roomId, @Param("fingerprint") String fingerprint);
}
