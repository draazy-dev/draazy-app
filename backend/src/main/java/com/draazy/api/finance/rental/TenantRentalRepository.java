package com.draazy.api.finance.rental;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

// Every query must be scoped by tenantId and exclude soft-deleted rows: it is the only
// access control on this table, so an unscoped query is a data leak.
public interface TenantRentalRepository extends JpaRepository<TenantRental, UUID> {
    @Query("select r from TenantRental r where r.tenantId = :tenantId and r.archived = false "
            + "order by r.leaseStart desc, r.createdAt desc")
    List<TenantRental> findLiveByTenantId(@Param("tenantId") UUID tenantId);

    @Query("select r from TenantRental r where r.id = :id and r.tenantId = :tenantId "
            + "and r.archived = false")
    Optional<TenantRental> findLiveByIdAndTenantId(@Param("id") UUID id,
                                                   @Param("tenantId") UUID tenantId);

    @Query("select count(r) from TenantRental r where r.tenantId = :tenantId and r.archived = false")
    long countLiveByTenantId(@Param("tenantId") UUID tenantId);
}
