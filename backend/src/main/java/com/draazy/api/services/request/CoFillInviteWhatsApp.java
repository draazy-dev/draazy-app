package com.draazy.api.services.request;

import com.draazy.api.common.persistence.AfterCommit;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.provider.DecisionMessenger;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class CoFillInviteWhatsApp {
    private static final Logger log = LoggerFactory.getLogger(CoFillInviteWhatsApp.class);

    private static final int MAX_TEXT = 80;
    private static final String FALLBACK_PLACE = "your rented home";

    private final DecisionMessenger messenger;
    private final Notifier notifier;
    private final String baseUrl;

    CoFillInviteWhatsApp(DecisionMessenger messenger, Notifier notifier,
            @Value("${draazy.app.base-url}") String baseUrl) {
        this.messenger = messenger;
        this.notifier = notifier;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    void send(ServiceRequest request, ServiceRequestParty party, String mobile, String inviterName) {
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())) {
            return;
        }
        if (party.getUserId() != null && !notifier.allowsWhatsapp(party.getUserId())) {
            return;
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
