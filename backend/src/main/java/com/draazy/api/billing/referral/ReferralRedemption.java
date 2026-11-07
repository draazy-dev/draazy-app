package com.draazy.api.billing.referral;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.ContactUsageLookup;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

@Component
class ReferralRedemption {
    private static final Duration VELOCITY_WINDOW = Duration.ofDays(1);

    private final ReferralRepository referrals;
    private final UserRepository users;
    private final PlatformSettings settings;
    private final ContactUsageLookup contactUsage;

    ReferralRedemption(ReferralRepository referrals, UserRepository users, PlatformSettings settings,
            ContactUsageLookup contactUsage) {
        this.referrals = referrals;
        this.users = users;
        this.settings = settings;
        this.contactUsage = contactUsage;
    }

    static ConflictException refuse() {
        return new ConflictException("That referral code cannot be redeemed");
    }

    void attribute(User referred, ReferralCode owner, String shareChannel, ReferralSignals.Signals observed) {
        if (!settings.referralRewardsEnabled()
                || owner.getUserId().equals(referred.getId())
                || referrals.existsByReferredMobile(referred.getMobile())
                || !withinSignupWindow(referred)
                || referred.getListingsCount() > 0
                || !contactUsage.contactTimes(referred.getId()).isEmpty()
                || ReferralSignals.matches(owner.getReferrerDeviceIdHash(), observed.deviceIdHash())) {
            throw refuse();
        }
        User referrer = users.findById(owner.getUserId()).orElseThrow(ReferralRedemption::refuse);
        boolean velocityHigh = referrals.countByReferrerIdAndAtAfter(
                referrer.getId(), Instant.now().minus(VELOCITY_WINDOW)) >= settings.referralVelocityPerDay();
        boolean sameIp = ReferralSignals.matches(owner.getReferrerIpHash(), observed.ipHash());
        boolean sameUa = ReferralSignals.matches(owner.getReferrerDeviceHash(), observed.deviceHash());
        boolean noDeviceId = observed.deviceIdHash() == null;
        boolean newReferrer = referrer.getCreatedAt() != null && referrer.getCreatedAt()
                .isAfter(Instant.now().minus(Duration.ofDays(settings.referralNewReferrerDays())));
        Referral referral = new Referral(
                referrer.getId(),
                referrer.getMobile(),
                referred.getName(),
                referred.getMobile(),
                "seeker",
                ShareChannels.normalise(shareChannel),
                risk(velocityHigh, sameIp, sameUa, newReferrer, noDeviceId),
                referred.isVerified(),
                velocityHigh,
                sameUa,
                sameIp,
                observed);
        try {
            referrals.saveAndFlush(referral);
        } catch (DataIntegrityViolationException raced) {
            throw refuse();
        }
    }

    private boolean withinSignupWindow(User referred) {
        return referred.getCreatedAt() != null && referred.getCreatedAt()
                .plus(Duration.ofHours(settings.referralSignupWindowHours())).isAfter(Instant.now());
    }

    private static String risk(boolean velocityHigh, boolean sameIp, boolean sameUa, boolean newReferrer,
            boolean noDeviceId) {
        int correlated = (sameIp ? 1 : 0) + (sameUa ? 1 : 0) + (newReferrer ? 1 : 0) + (noDeviceId ? 1 : 0);
        if (velocityHigh || correlated >= 2) {
            return ReferralStatuses.RISK_HIGH;
        }
        return correlated == 1 ? ReferralStatuses.RISK_MEDIUM : ReferralStatuses.RISK_LOW;
    }
}
