package com.draazy.api.billing.referral;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.persistence.AfterCommit;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.security.AuthPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReferralInvites {
    static final Duration DEDUPE_WINDOW = Duration.ofDays(30);

    private static final Logger log = LoggerFactory.getLogger(ReferralInvites.class);

    private static final Duration CAP_WINDOW = Duration.ofDays(1);
    private static final int RETRY_AFTER_SECONDS = 3600;
    private static final int MAX_TEXT = 80;
    private static final String MOBILE_PATTERN = "[6-9]\\d{9}";
    private static final String FALLBACK_NAME = "A friend";

    private final ReferralInviteRepository invites;
    private final ReferralCodeMinter minter;
    private final UserRepository users;
    private final PlatformSettings settings;
    private final DecisionMessenger messenger;
    private final RateLimitLock locks;
    private final String baseUrl;

    public ReferralInvites(ReferralInviteRepository invites, ReferralCodeMinter minter, UserRepository users,
            PlatformSettings settings, DecisionMessenger messenger, RateLimitLock locks,
            @Value("${draazy.app.base-url}") String baseUrl) {
        this.invites = invites;
        this.minter = minter;
        this.users = users;
        this.settings = settings;
        this.messenger = messenger;
        this.locks = locks;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    @Transactional
    public ReferralInviteResponse invite(AuthPrincipal caller, String rawMobile, HttpServletRequest request) {
        if (!settings.referralRewardsEnabled()) {
            throw new ConflictException("Referrals are paused right now");
        }
        String mobile = MobileMask.normalise(rawMobile);
        if (mobile == null || !mobile.matches(MOBILE_PATTERN)) {
            throw new ValidationException(ErrorCodes.INVALID_MOBILE, "Enter a valid 10-digit mobile number");
        }
        User inviter = users.findById(caller.userId()).orElseThrow(() -> NotFoundException.of("User"));
        if (mobile.equals(inviter.getMobile())) {
            throw new ValidationException(ErrorCodes.OWN_NUMBER, "That is your own number");
        }
        locks.holdUntilCommit(RateLimitLock.Limit.REFERRAL_INVITER, inviter.getId().toString());
        locks.holdUntilCommit(RateLimitLock.Limit.REFERRAL_INVITE_MOBILE, mobile);
        Instant now = Instant.now();
        if (invites.countByReferrerIdAndCreatedAtAfter(inviter.getId(), now.minus(CAP_WINDOW))
                >= settings.referralInvitesPerDay()) {
            throw new RateLimitedException(ErrorCodes.INVITE_LIMIT,
                    "You have reached today's invite limit. Try again tomorrow.", RETRY_AFTER_SECONDS);
        }
        String link = baseUrl + "/signup?ref=" + minter.codeFor(inviter.getId(), request);
        boolean skip = users.existsByMobile(mobile)
                || invites.existsByMobileAndCreatedAtAfter(mobile, now.minus(DEDUPE_WINDOW));
        boolean viaApi = messenger.referralInviteEnabled();
        invites.save(new ReferralInvite(inviter.getId(), mobile,
                skip ? ReferralInvite.SKIPPED : viaApi ? ReferralInvite.SENT : ReferralInvite.OPEN_WHATSAPP));
        if (!viaApi) {
            return ReferralInviteResponse.openWhatsapp(whatsappUrl(mobile, link));
        }
        if (!skip) {
            String name = firstName(inviter.getName());
            AfterCommit.run(() -> dispatch(mobile, name, link));
        }
        return ReferralInviteResponse.sent();
    }

    // Runs after commit: a throw here would fail a request whose invite is already saved.
    private void dispatch(String mobile, String inviterName, String link) {
        try {
            messenger.sendReferralInvite(mobile, inviterName, link);
        } catch (RuntimeException e) {
            log.warn("Referral invite WhatsApp to {} failed", MobileMask.mask(mobile), e);
        }
    }

    private static String whatsappUrl(String mobile, String link) {
        String text = "Join me on Draazy: rent or list homes in Pune with zero brokerage. Sign up here: " + link;
        return "https://wa.me/91" + mobile + "?text=" + URLEncoder.encode(text, StandardCharsets.UTF_8);
    }

    // Meta rejects template parameters carrying newlines, tabs or long runs of spaces.
    private static String firstName(String name) {
        String text = name == null ? "" : name.replaceAll("\\s+", " ").strip();
        if (text.isEmpty()) {
            return FALLBACK_NAME;
        }
        String first = text.split(" ")[0];
        return first.length() > MAX_TEXT ? first.substring(0, MAX_TEXT) : first;
    }
}
