package com.draazy.api.billing.referral;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.NewAccountAnnouncer;
import com.draazy.api.identity.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Component
class ReferralInviteAttribution implements NewAccountAnnouncer {
    private static final Logger log = LoggerFactory.getLogger(ReferralInviteAttribution.class);

    private final ReferralInviteRepository invites;
    private final ReferralCodeRepository codes;
    private final UserRepository users;
    private final ReferralRedemption redemption;
    private final ReferralSignals signals;
    private final PlatformSettings settings;

    ReferralInviteAttribution(ReferralInviteRepository invites, ReferralCodeRepository codes,
            UserRepository users, ReferralRedemption redemption, ReferralSignals signals,
            PlatformSettings settings) {
        this.invites = invites;
        this.codes = codes;
        this.users = users;
        this.redemption = redemption;
        this.signals = signals;
        this.settings = settings;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void accountCreated(UUID userId, String mobile) {
        if (!settings.referralRewardsEnabled()) {
            return;
        }
        Instant since = Instant.now().minus(ReferralInvites.DEDUPE_WINDOW);
        List<UUID> inviters = invites.referrersSince(mobile, since, PageRequest.of(0, 1));
        if (inviters.isEmpty()) {
            return;
        }
        var owner = codes.findById(inviters.getFirst());
        var referred = users.findById(userId);
        if (owner.isEmpty() || referred.isEmpty()) {
            return;
        }
        try {
            redemption.attribute(referred.get(), owner.get(), ShareChannels.WHATSAPP,
                    signals.of(currentRequest()));
        } catch (ConflictException refused) {
            log.info("Invite attribution refused for new account {}", userId);
        }
    }

    private static HttpServletRequest currentRequest() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                ? attributes.getRequest() : null;
    }
}
