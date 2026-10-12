package com.draazy.api.billing.referral;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.VerificationAnnouncer;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Settles a pending referral on the referee's first verified listing or accepted contact request. */
@Service
public class ReferralQualification implements VerificationAnnouncer {

    private static final long SAME_OWNER_WINDOW_DAYS = 30;

    private final ReferralRepository referrals;
    private final PlatformSettings settings;
    private final ReferralOutcomes outcomes;
    private final PropertyRepository properties;
    private final RateLimitLock locks;

    public ReferralQualification(ReferralRepository referrals, PlatformSettings settings,
            ReferralOutcomes outcomes, PropertyRepository properties, RateLimitLock locks) {
        this.referrals = referrals;
        this.settings = settings;
        this.outcomes = outcomes;
        this.properties = properties;
        this.locks = locks;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRED)
    public void announceOwnershipVerified(UUID ownerId, UUID propertyId, Instant verifiedAt) {
        qualify(ownerId, ReferralStatuses.TRACK_OWNER, propertyId, null, verifiedAt);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void announceContactAccepted(UUID requesterId, UUID ownerId, UUID propertyId, Instant at) {
        if (properties.findById(propertyId).filter(Property::isPubliclyVisible).isEmpty()) {
            return;
        }
        qualify(requesterId, ReferralStatuses.TRACK_SEEKER, propertyId, ownerId, at);
    }

    private void qualify(UUID refereeId, String track, UUID propertyId, UUID approvingOwnerId, Instant at) {
        if (!settings.referralRewardsEnabled()) {
            return;
        }
        Optional<Referral> pending = referrals.findPendingForQualification(refereeId);
        if (pending.isEmpty()) {
            return;
        }
        Referral referral = pending.get();
        // After the row lock, so every path takes referral row then referrer; counts below see a rival's commit.
        locks.holdUntilCommit(RateLimitLock.Limit.REFERRER_QUALIFY, referral.getReferrerId().toString());
        boolean owner = ReferralStatuses.TRACK_OWNER.equals(track);
        long amount = owner ? settings.referralOwnerRewardAgreements() : settings.referralContactBonus();
        referral.qualifyOn(track, propertyId, at,
                "+" + amount + (owner ? " free rent agreement" + (amount == 1 ? "" : "s") : " owner contacts"),
                amount);

        if (!owner && referral.getReferrerId().equals(approvingOwnerId)) {
            outcomes.rejected(referral, ReferralClawbacks.SELF_DEALING, "Automatic: the referrer approved the contact",
                    "A referral could not be verified. Contact support if you think this is wrong.");
        } else if (ReferralStatuses.RISK_HIGH.equals(referral.getRisk())
                || (!owner && sameOwnerQualifiedOthers(referral, approvingOwnerId, at))) {
            outcomes.rejected(referral, "high_risk", "Automatic: high-risk signals at redeem",
                    "A referral could not be verified. Contact support if you think this is wrong.");
        } else if (overCap(referral, at)) {
            outcomes.rejected(referral, "cap_reached", "Automatic: referral cap reached",
                    "A referral did not count because you reached the referral limit for this period.");
        } else if (ReferralStatuses.RISK_MEDIUM.equals(referral.getRisk())) {
            outcomes.held(referral, at.plus(Duration.ofDays(settings.referralHoldDays())),
                    "Automatic: held for review of medium-risk signals");
        } else {
            outcomes.granted(referral, "Automatic: low risk");
        }
    }

    // One owner vouching for several of the same referrer's referees is a ring, not independent demand.
    private boolean sameOwnerQualifiedOthers(Referral referral, UUID ownerId, Instant at) {
        return referrals.countSeekerQualifiedByOwner(referral.getReferrerId(), ownerId, referral.getId(),
                at.minus(Duration.ofDays(SAME_OWNER_WINDOW_DAYS))) > 0;
    }

    // Calendar month and year in IST, so a referrer cannot bank a window by waiting for a rolling edge.
    private boolean overCap(Referral referral, Instant at) {
        ZonedDateTime local = at.atZone(PlatformTime.IST);
        ZonedDateTime month = local.toLocalDate().withDayOfMonth(1).atStartOfDay(PlatformTime.IST);
        ZonedDateTime year = local.toLocalDate().withDayOfYear(1).atStartOfDay(PlatformTime.IST);
        UUID referrer = referral.getReferrerId();
        return referrals.countCappedBetween(referrer, month.toInstant(), month.plusMonths(1).toInstant())
                        >= settings.referralQualifyPerMonth()
                || referrals.countCappedBetween(referrer, year.toInstant(), year.plusYears(1).toInstant())
                        >= settings.referralQualifyPerYear();
    }
}
