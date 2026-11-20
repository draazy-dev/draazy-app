package com.draazy.api.billing.referral;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReferralCodeRepository extends JpaRepository<ReferralCode, UUID> {
    Optional<ReferralCode> findByCode(String code);

    boolean existsByCode(String code);

    @Modifying
    @Query("""
            update ReferralCode c
               set c.referrerIpHash = null, c.referrerDeviceHash = null, c.referrerDeviceIdHash = null,
                   c.signalsAt = null
             where c.signalsAt < :cutoff
            """)
    int clearSignalsOlderThan(@Param("cutoff") Instant cutoff);
}
