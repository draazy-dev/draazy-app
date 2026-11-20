package com.draazy.api.documents.agreement;

import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RentAgreementRepository extends JpaRepository<RentAgreement, UUID> {
    @Query("""
            select a from RentAgreement a
            where a.ownerId = :ownerId
               or (:mobile is not null and a.tenantMobile = :mobile)
            order by a.createdAt desc
            """)
    List<RentAgreement> findForParty(@Param("ownerId") UUID ownerId, @Param("mobile") String mobile);

    List<RentAgreement> findByServiceRequestIdOrderByCreatedAtAsc(UUID serviceRequestId);

    @Query("""
            select a from RentAgreement a
            where a.propertyId = :propertyId
              and a.serviceRequestId is null
              and a.status in ('e-sign-pending', 'registered', 'active')
            order by a.createdAt asc
            """)
    List<RentAgreement> findFiledOnListing(@Param("propertyId") UUID propertyId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from RentAgreement a where a.id = :id")
    Optional<RentAgreement> lockById(@Param("id") UUID id);

    @Query("""
            select count(a) > 0 from RentAgreement a
            where a.propertyId = :propertyId
              and :mobile is not null and a.tenantMobile = :mobile
              and a.status in ('registered', 'active')
              and a.serviceRequestId is not null
              and a.finalDocumentId is not null
              and a.verifiedBy is not null
            """)
    boolean hasRegisteredTenancy(@Param("propertyId") UUID propertyId, @Param("mobile") String mobile);

    @Query(value = """
            select * from rent_agreements
            where status in ('registered', 'active')
              and start_date is not null and duration_months is not null
              and renewal_reminded_at is null
              and (start_date + duration_months * interval '1 month')::date - 1 between :from and :to
              and not exists (select 1 from managed_properties m
                               where m.agreement_request_id = rent_agreements.service_request_id)
            order by created_at
            """, nativeQuery = true)
    List<RentAgreement> findEndingBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
