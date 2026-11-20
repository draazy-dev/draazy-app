package com.draazy.api.engagement.flatmate;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FlatmateInterestWithdrawalRepository extends JpaRepository<FlatmateInterestWithdrawal, UUID> {

    long countByRequesterIdAndRequestedAtAfter(UUID requesterId, Instant since);

    Optional<FlatmateInterestWithdrawal> findFirstByRequesterIdAndKindAndTargetIdOrderByWithdrawnAtDesc(
            UUID requesterId, String kind, UUID targetId);
}
