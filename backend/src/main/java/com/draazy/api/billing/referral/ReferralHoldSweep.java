package com.draazy.api.billing.referral;

import com.draazy.api.common.settings.PlatformSettings;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Hourly: settles referrals whose hold ran out and re-checks granted ones, one transaction per row. */
@Component
@ConditionalOnProperty(name = "draazy.referrals.hold-sweep.enabled", havingValue = "true", matchIfMissing = true)
public class ReferralHoldSweep {

    private static final Logger log = LoggerFactory.getLogger(ReferralHoldSweep.class);

    private static final long EVERY_HOUR_MS = 60L * 60L * 1000L;
    private static final long AFTER_STARTUP_MS = 5L * 60L * 1000L;
    private static final PageRequest BATCH = PageRequest.of(0, 500);

    private final ReferralRepository referrals;
    private final ReferralHolds holds;
    private final ReferralClawbacks clawbacks;
    private final PlatformSettings settings;

    public ReferralHoldSweep(ReferralRepository referrals, ReferralHolds holds, ReferralClawbacks clawbacks,
            PlatformSettings settings) {
        this.referrals = referrals;
        this.holds = holds;
        this.clawbacks = clawbacks;
        this.settings = settings;
    }

    @Scheduled(fixedDelay = EVERY_HOUR_MS, initialDelay = AFTER_STARTUP_MS)
    public void sweep() {
        Instant now = Instant.now();
        for (UUID id : referrals.dueHeldIds(now, BATCH)) {
            attempt("release", id, () -> holds.release(id, now));
        }
        List<UUID> recent = referrals.grantedSinceIds(
                now.minus(Duration.ofDays(settings.referralClawbackDays())), BATCH);
        for (UUID id : recent) {
            attempt("recheck", id, () -> clawbacks.recheck(id));
        }
    }

    private void attempt(String what, UUID id, Runnable action) {
        try {
            action.run();
        } catch (RuntimeException e) {
            log.error("Referral {} failed for {}; will retry on the next tick", what, id, e);
        }
    }
}
