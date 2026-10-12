package com.draazy.api.billing.referral;

import com.draazy.api.common.settings.PlatformSettings;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Decides one held referral once its hold has run out: earn, or reject if the evidence has gone bad. */
@Service
public class ReferralHolds {

    private final ReferralRepository referrals;
    private final ReferralClawbacks clawbacks;
    private final ReferralOutcomes outcomes;
    private final PlatformSettings settings;

    public ReferralHolds(ReferralRepository referrals, ReferralClawbacks clawbacks, ReferralOutcomes outcomes,
            PlatformSettings settings) {
        this.referrals = referrals;
        this.clawbacks = clawbacks;
        this.outcomes = outcomes;
        this.settings = settings;
    }

    @Transactional
    public void release(UUID referralId, Instant now) {
        if (!settings.referralRewardsEnabled()) {
            return;
        }
        referrals.findForDecision(referralId)
                .filter(r -> ReferralStatuses.HELD.equals(r.getStatus())
                        && r.getHoldUntil() != null && !r.getHoldUntil().isAfter(now))
                .ifPresent(r -> {
                    String problem = clawbacks.problem(r, true);
                    if (problem == null) {
                        outcomes.released(r, "Automatic: hold elapsed with no problem found");
                    } else {
                        outcomes.rejected(r, problem, "Automatic: " + problem,
                                "A referral could not be verified. Contact support if you think this is wrong.");
                    }
                });
    }
}
