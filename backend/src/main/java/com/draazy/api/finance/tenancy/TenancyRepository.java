package com.draazy.api.finance.tenancy;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TenancyRepository extends JpaRepository<Tenancy, UUID> {
    @Query("select t from Tenancy t where t.propertyId = :propertyId and t.status = 'active'")
    Optional<Tenancy> findActiveByPropertyId(@Param("propertyId") UUID propertyId);

    @Query("select t from Tenancy t where t.propertyId = :propertyId and t.status = 'pending'")
    Optional<Tenancy> findPendingByPropertyId(@Param("propertyId") UUID propertyId);

    // Status changes are conditional on the status the caller read, so a concurrent answer,
    // reopen or re-close updates 0 rows instead of clobbering the row.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Tenancy t set t.status = 'active', t.startDate = :startDate "
            + "where t.id = :id and t.status = 'pending'")
    int activatePending(@Param("id") UUID id, @Param("startDate") LocalDate startDate);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Tenancy t set t.status = 'declined' where t.id = :id and t.status = 'pending'")
    int declinePending(@Param("id") UUID id);

    @Modifying(flushAutomatically = true)
    @Query("update Tenancy t set t.status = 'declined' where t.propertyId = :propertyId and t.status = 'pending'")
    int declinePendingByPropertyId(@Param("propertyId") UUID propertyId);

    @Modifying(flushAutomatically = true)
    @Query("update Tenancy t set t.status = 'ended', t.endDate = :endDate "
            + "where t.propertyId = :propertyId and t.status = 'active'")
    int endActiveByPropertyId(@Param("propertyId") UUID propertyId, @Param("endDate") LocalDate endDate);

    @Query("select t from Tenancy t where t.propertyId = :propertyId order by t.startDate desc")
    List<Tenancy> findByPropertyId(@Param("propertyId") UUID propertyId);

    @Query("select t from Tenancy t where t.tenantId = :tenantId and t.status <> 'declined' "
            + "order by case t.status when 'pending' then 0 when 'active' then 1 else 2 end, t.startDate desc")
    List<Tenancy> findByTenantId(@Param("tenantId") UUID tenantId);

    @Query("select count(t) > 0 from Tenancy t where t.status in ('active','ended','terminated') and "
            + "((t.ownerId = :a and t.tenantId = :b) or (t.ownerId = :b and t.tenantId = :a))")
    boolean existsBetween(@Param("a") UUID a, @Param("b") UUID b);

    @Query("select count(t) > 0 from Tenancy t where t.tenantId = :tenantId and t.propertyId = :propertyId "
            + "and t.status in ('active','ended','terminated')")
    boolean existsByTenantIdAndPropertyId(@Param("tenantId") UUID tenantId, @Param("propertyId") UUID propertyId);

    @Query("select count(t) > 0 from Tenancy t where t.tenantId = :tenantId and t.ownerId = :ownerId "
            + "and t.status in ('active','ended','terminated')")
    boolean existsConfirmedByTenantIdAndOwnerId(@Param("tenantId") UUID tenantId, @Param("ownerId") UUID ownerId);
}
