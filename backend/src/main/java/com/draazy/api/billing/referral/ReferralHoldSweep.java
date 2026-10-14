package com.draazy.api.billing.referral;

import com.draazy.api.common.settings.PlatformSettings;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

/** Settles referrals whose hold ran out and re-checks granted ones, one transaction per row. */
@Component
public class ReferralHoldSweep {

    private static final Logger log = LoggerFactory.getLogger(ReferralHoldSweep.class);

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

    /** Settles one capped page of due holds and returns how many actually moved, so a drain stops on a dead page. */
    public int releaseDue() {
        Instant now = Instant.now();
        int released = 0;
        for (UUID id : referrals.dueHeldIds(now, BATCH)) {
            if (attempt("release", id, () -> holds.release(id, now))) {
                released++;
            }
        }
        return released;
    }

    public void recheckGranted() {
        for (UUID id : referrals.grantedSinceIds(
                Instant.now().minus(Duration.ofDays(settings.referralClawbackDays())))) {
            attempt("recheck", id, () -> {
                clawbacks.recheck(id);
                return false;
            });
        }
    }

    private boolean attempt(String what, UUID id, BooleanSupplier action) {
        try {
            return action.getAsBoolean();
        } catch (RuntimeException e) {
            log.error("Referral {} failed for {}; will retry on the next tick", what, id, e);
            return false;
        }
    }
}
