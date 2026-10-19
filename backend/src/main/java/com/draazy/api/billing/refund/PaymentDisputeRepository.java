package com.draazy.api.billing.refund;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentDisputeRepository extends JpaRepository<PaymentDispute, UUID> {

    Optional<PaymentDispute> findByDisputeRef(String disputeRef);

    @Query("select d from PaymentDispute d where d.status = :status and d.openedAt >= :since")
    Page<PaymentDispute> findByStatusSince(@Param("status") String status, @Param("since") Instant since,
            Pageable pageable);

    long countByStatus(String status);

    List<PaymentDispute> findByOrderRefInAndStatus(Collection<String> orderRefs, String status);

    boolean existsBySubscriptionIdAndStatus(UUID subscriptionId, String status);
}