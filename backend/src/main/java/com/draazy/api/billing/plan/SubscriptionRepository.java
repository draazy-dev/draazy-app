package com.draazy.api.billing.plan;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {
    List<Subscription> findByUserIdOrderByStartedAtDesc(UUID userId);

    @Query("""
            select s from Subscription s
            where s.userId = :userId and s.propertyId is not null and s.status in :entitling
              and s.renewsAt > :now
              and exists (select 1 from Plan p where p.id = s.planId and p.kind = 'listing-pass')
            order by s.renewsAt""")
    List<Subscription> findEntitlingPasses(@Param("userId") UUID userId,
            @Param("entitling") Collection<String> entitling, @Param("now") Instant now);

    @Query("""
            select new com.draazy.api.billing.plan.ContactPackTerm(s.id, s.startedAt, s.renewsAt, p.contactLimit,
                                                                   s.frozenAt)
            from Subscription s join Plan p on p.id = s.planId
            where s.userId = :userId and p.kind = 'contact-pack' and p.contactLimit is not null
              and s.status in ('active', 'past-due', 'expired', 'refund-review', 'disputed')
              and s.renewsAt is not null""")
    List<ContactPackTerm> findContactPackTerms(@Param("userId") UUID userId);

    Optional<Subscription> findByPaymentRef(String paymentRef);

    Optional<Subscription> findByUserIdAndIdempotencyKey(UUID userId, String idempotencyKey);

    List<Subscription> findByStatusAndRenewsAtLessThanEqual(String status, Instant cutoff);

    long countByUserIdAndStatus(UUID userId, String status);

    @Query("""
            select s from Subscription s where s.refundDueAt is not null and s.refundRef is null
            order by s.refundTriedAt asc nulls first, s.refundDueAt asc""")
    List<Subscription> findRefundsDue(Limit batch);

    @Modifying
    @Query(value = "UPDATE subscriptions SET refund_tried_at = :at WHERE id = :id", nativeQuery = true)
    void markRefundTried(@Param("id") UUID id, @Param("at") Instant at);

    List<Subscription> findByStatusAndCreatedAtBeforeOrderByCreatedAtAsc(String status,
            Instant cutoff, Limit batch);
}
