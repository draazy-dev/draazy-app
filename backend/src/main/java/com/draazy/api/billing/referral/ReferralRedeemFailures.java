package com.draazy.api.billing.referral;

import com.draazy.api.common.settings.PlatformSettings;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
class ReferralRedeemFailures {
    private static final Duration WINDOW = Duration.ofDays(1);

    private final ReferralRedeemFailureRepository failures;
    private final PlatformSettings settings;

    ReferralRedeemFailures(ReferralRedeemFailureRepository failures, PlatformSettings settings) {
        this.failures = failures;
        this.settings = settings;
    }

    @Transactional(readOnly = true)
    // Per account only: Indian mobile carriers put many users behind one IP, and every account costs an OTP.
    boolean lockedOut(UUID userId) {
        return failures.countByUserIdAndCreatedAtAfter(userId, Instant.now().minus(WINDOW))
                >= settings.referralRedeemFailuresPerDay();
    }

    // Separate transaction: the caller's redeem rolls back when it refuses, and the count must survive that.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void record(UUID userId, String ipHash) {
        failures.save(new ReferralRedeemFailure(userId, ipHash));
    }
}
