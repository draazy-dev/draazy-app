package com.draazy.api.services.request;

import com.draazy.api.common.persistence.AfterCommit;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.security.WriteRateLimitStore;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class CoFillInviteWhatsApp {
    private static final Logger log = LoggerFactory.getLogger(CoFillInviteWhatsApp.class);

    private static final int MAX_TEXT = 80;
    private static final String FALLBACK_PLACE = "your rented home";
    static final int MAX_PER_NUMBER = 3;
    // An owner plus six tenants, with room to correct a few typos.
    static final int MAX_PER_INVITER = 10;

    private final DecisionMessenger messenger;
    private final Notifier notifier;
    private final String baseUrl;
    private final WriteRateLimitStore perNumber;
    private final WriteRateLimitStore perInviter;
    private final WriteRateLimitStore platform;

    CoFillInviteWhatsApp(DecisionMessenger messenger, Notifier notifier, WriteRateLimitStore.Factory stores,
            @Value("${draazy.app.base-url}") String baseUrl,
            @Value("${draazy.services.agreement-invites-per-hour:60}") int maxPerHour) {
        this.messenger = messenger;
        this.notifier = notifier;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.perNumber = stores.create("ai-to", MAX_PER_NUMBER, Duration.ofDays(1));
        this.perInviter = stores.create("ai-by", MAX_PER_INVITER, Duration.ofDays(1));
        this.platform = stores.create("ai-all", maxPerHour, Duration.ofHours(1));
    }

    boolean send(ServiceRequest request, ServiceRequestParty party, String mobile, String inviterName) {
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())) {
            return false;
        }
        if (party.getUserId() != null && !notifier.allowsWhatsapp(party.getUserId())) {
            return false;
        }
        if (!withinBudget(mobile, request.getRequesterId())) {
            return false;
        }
        String side = party.getRole();
        String named = oneLine(inviterName);
        String inviter = named != null ? named : "owner".equals(side) ? "Your tenant" : "Your owner";
        Map<String, Object> details = request.getDetails();
        String place = Objects.requireNonNullElse(oneLine(details == null ? null : details.get("property")),
                FALLBACK_PLACE);
        String link = baseUrl + ServiceRequestTypes.pageFor(request.getType())
                + "?party=" + party.getId() + "&request=" + request.getId();
        AfterCommit.run(() -> dispatch(mobile, inviter, side, place, link));
        return messenger.agreementInviteDeliverable(mobile);
    }

    private boolean withinBudget(String mobile, UUID inviter) {
        Instant now = Instant.now();
        // Inviter first: one who is over their own cap must not burn the recipient's slots.
        String spent = perInviter.tryAcquire(String.valueOf(inviter), now) > 0 ? "the inviter's daily cap"
                : perNumber.tryAcquire(mobile, now) > 0 ? "this number's daily cap"
                : platform.tryAcquire("all", now) > 0 ? "the platform's hourly budget"
                : null;
        if (spent != null) {
            log.info("Agreement invite WhatsApp to {} skipped: {} is spent", MobileMask.mask(mobile), spent);
        }
        return spent == null;
    }

    // Runs after commit: a throw here would fail a request whose invite is already saved.
    private void dispatch(String mobile, String inviter, String side, String place, String link) {
        try {
            messenger.sendAgreementInvite(mobile, inviter, side, place, link);
        } catch (RuntimeException e) {
            log.warn("Agreement invite WhatsApp to {} failed", MobileMask.mask(mobile), e);
        }
    }

    // Meta rejects template parameters carrying newlines, tabs or long runs of spaces.
    static String oneLine(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().replaceAll("\\s+", " ").strip();
        if (text.isEmpty()) {
            return null;
        }
        return text.length() > MAX_TEXT ? text.substring(0, MAX_TEXT).strip() : text;
    }
}
