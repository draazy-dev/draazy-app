package com.draazy.api.billing.referral;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Referral codes, by owner and by the code itself (unique in the DB, V23). */
public interface ReferralCodeRepository extends JpaRepository<ReferralCode, UUID> {

    Optional<ReferralCode> findByCode(String code);

    /** Checked before minting, so a unique-constraint violation never poisons the persistence context. */
    boolean existsByCode(String code);

    // Keyed on signalsAt, not createdAt: the row outlives its digests, since the code is permanent.
    // signalsAt is cleared too, so a second tick skips rows the first already emptied.
    @Modifying
    @Query("""
            update ReferralCode c
               set c.referrerIpHash = null, c.referrerDeviceHash = null, c.referrerDeviceIdHash = null,
                   c.signalsAt = null
             where c.signalsAt < :cutoff
            """)
    int clearSignalsOlderThan(@Param("cutoff") Instant cutoff);
}
