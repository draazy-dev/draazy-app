package com.draazy.api.billing.referral;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReferralRedeemFailureRepository extends JpaRepository<ReferralRedeemFailure, UUID> {
    long countByUserIdAndCreatedAtAfter(UUID userId, Instant since);

    @Modifying
    @Query("delete from ReferralRedeemFailure f where f.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}
