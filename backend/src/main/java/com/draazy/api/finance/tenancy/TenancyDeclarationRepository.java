package com.draazy.api.finance.tenancy;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TenancyDeclarationRepository extends JpaRepository<TenancyDeclaration, UUID> {
    @Query("select count(d) > 0 from TenancyDeclaration d where d.declarantId = :declarantId "
            + "and d.propertyId = :propertyId and d.status = 'confirmed'")
    boolean existsConfirmedFor(@Param("declarantId") UUID declarantId,
            @Param("propertyId") UUID propertyId);

    Page<TenancyDeclaration> findByPropertyIdOrderByCreatedAtDesc(UUID propertyId, Pageable pageable);

    boolean existsByPropertyIdAndDeclarantId(UUID propertyId, UUID declarantId);

    Optional<TenancyDeclaration> findByPropertyIdAndDeclarantId(UUID propertyId, UUID declarantId);
}
