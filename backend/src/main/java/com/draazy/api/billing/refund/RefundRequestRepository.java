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

    @Query("select r from RefundRequest r where r.status = :status and r.createdAt >= :since")
    Page<RefundRequest> findByStatusSince(@Param("status") String status, @Param("since") Instant since,
            Pageable pageable);

    long countByStatus(String status);

    /** One decision per request: the row lock is what serialises two staff members on the same row. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RefundRequest r where r.id = :id")
    Optional<RefundRequest> findForDecision(@Param("id") UUID id);

    /** Requests made earlier than {@code before} by this account, or from the same device or payment
     * instrument, that still stand. {@code basis} is a LIKE pattern. */
    @Query("""
            select count(r) from RefundRequest r
            where r.basis like :basis and r.status in ('pending_review', 'approved')
              and r.createdAt >= :since and r.createdAt < :before and r.id <> :self
              and (r.userId = :userId or r.deviceIdHash = :device or r.instrumentHash = :instrument)""")
    long countLinked(@Param("basis") String basis, @Param("since") Instant since, @Param("before") Instant before,
            @Param("self") UUID self, @Param("userId") UUID userId, @Param("device") String device,
            @Param("instrument") String instrument);

    /** Other accounts that asked for a refund from the same device or payment instrument. */
    @Query("""
            select count(distinct r.userId) from RefundRequest r
            where r.userId <> :userId and (r.deviceIdHash = :device or r.instrumentHash = :instrument)""")
    long countLinkedAccounts(@Param("userId") UUID userId, @Param("device") String device,
            @Param("instrument") String instrument);

    /** Refunds the system queued on its own: no customer request sits behind them. */
    @Query("""
            select s from Subscription s
            where s.refundDueAt is not null
              and s.refundDueAt >= :since
              and not exists (select 1 from RefundRequest r where r.subscriptionId = s.id)
            order by s.refundDueAt desc""")
    Page<Subscription> findAutoRefunds(@Param("since") Instant since, Pageable pageable);
}