package com.draazy.api.billing.refund;

import com.draazy.api.billing.plan.Subscription;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefundRequestRepository extends JpaRepository<RefundRequest, UUID> {
    Optional<RefundRequest> findBySubscriptionId(UUID subscriptionId);

    Optional<RefundRequest> findByUserIdAndIdempotencyKey(UUID userId, String idempotencyKey);

    List<RefundRequest> findBySubscriptionIdIn(Collection<UUID> subscriptionIds);

    interface DeskEntry {
        UUID getId();

        String getKind();
    }

    // Rent-agreement refunds live in service_request_refunds; one union keeps both on a single newest-first page.
    @Query(value = """
            select q.id as id, q.kind as kind from (
              select r.id, 'pass' as kind, r.created_at from refund_requests r
              where :passes and r.status = :status and r.created_at >= :since
              union all
              select s.id, 'rent_agreement', s.created_at from service_request_refunds s
              where :rentAgreements and s.status in (:rentAgreementStatuses) and s.created_at >= :since
            ) q order by q.created_at desc, q.id""",
            countQuery = """
            select (select count(*) from refund_requests r
                    where :passes and r.status = :status and r.created_at >= :since)
                 + (select count(*) from service_request_refunds s
                    where :rentAgreements and s.status in (:rentAgreementStatuses) and s.created_at >= :since)""",
            nativeQuery = true)
    Page<DeskEntry> findDeskEntries(@Param("passes") boolean passes, @Param("status") String status,
            @Param("rentAgreements") boolean rentAgreements,
            @Param("rentAgreementStatuses") Collection<String> rentAgreementStatuses,
            @Param("since") Instant since, Pageable pageable);

    long countByStatus(String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RefundRequest r where r.id = :id")
    Optional<RefundRequest> findForDecision(@Param("id") UUID id);

    @Query("""
            select count(r) from RefundRequest r
            where r.basis like :basis and r.status in ('pending_review', 'approved')
              and r.createdAt >= :since and r.createdAt < :before and r.id <> :self
              and (r.userId = :userId or r.deviceIdHash = :device or r.instrumentHash = :instrument)""")
    long countLinked(@Param("basis") String basis, @Param("since") Instant since, @Param("before") Instant before,
            @Param("self") UUID self, @Param("userId") UUID userId, @Param("device") String device,
            @Param("instrument") String instrument);

    @Query("""
            select count(distinct r.userId) from RefundRequest r
            where r.userId <> :userId and (r.deviceIdHash = :device or r.instrumentHash = :instrument)""")
    long countLinkedAccounts(@Param("userId") UUID userId, @Param("device") String device,
            @Param("instrument") String instrument);

    @Query("""
            select s from Subscription s
            where s.refundDueAt is not null
              and s.refundDueAt >= :since
              and not exists (select 1 from RefundRequest r where r.subscriptionId = s.id)
            order by s.refundDueAt desc""")
    Page<Subscription> findAutoRefunds(@Param("since") Instant since, Pageable pageable);
}