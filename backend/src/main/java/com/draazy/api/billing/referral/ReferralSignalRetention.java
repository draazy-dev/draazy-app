package com.draazy.api.billing.referral;

import com.draazy.api.common.settings.PlatformSettings;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Expires the referral correlation digests after the configured retention window. */
@Service
public class ReferralSignalRetention {

    private static final Logger log = LoggerFactory.getLogger(ReferralSignalRetention.class);

    private final ReferralRepository referrals;
    private final ReferralCodeRepository codes;
    private final PlatformSettings settings;

    public ReferralSignalRetention(ReferralRepository referrals, ReferralCodeRepository codes,
            PlatformSettings settings) {
        this.referrals = referrals;
        this.codes = codes;
        this.settings = settings;
    }

    // One transaction over both tables so no comparison is left half-erased.
    @Transactional
    public int expireSignalsOlderThan(Instant cutoff) {
        int cleared = referrals.clearSignalsOlderThan(cutoff) + codes.clearSignalsOlderThan(cutoff);
        if (cleared > 0) {
            log.info("Referral signal retention cleared digests on {} row(s)", cleared);
        }
        return cleared;
    }

    @Transactional
    public int expireNow() {
        return expireSignalsOlderThan(Instant.now().minus(Duration.ofDays(settings.referralSignalRetentionDays())));
    }
}
