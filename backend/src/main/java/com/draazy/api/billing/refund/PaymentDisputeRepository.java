package com.draazy.api.billing.refund;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentDisputeRepository extends JpaRepository<PaymentDispute, UUID> {

    Optional<PaymentDispute> findByDisputeRef(String disputeRef);

    Page<PaymentDispute> findByStatus(String status, Pageable pageable);

    long countByStatus(String status);

    List<PaymentDispute> findByOrderRefInAndStatus(Collection<String> orderRefs, String status);

    boolean existsBySubscriptionIdAndStatus(UUID subscriptionId, String status);
}