package com.draazy.api.provider.whatsapp;

import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.provider.ProviderCalls;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "draazy.providers.whatsapp", name = "enabled", havingValue = "true")
class WhatsAppDecisionMessenger implements DecisionMessenger {
    private static final Logger log = LoggerFactory.getLogger(WhatsAppDecisionMessenger.class);

    private static final String COUNTRY_CODE = "91";

    private static final String OPERATION = DecisionMessenger.IDENTITY_DECISION;

    private final WhatsAppClient client;
    private final WhatsAppProperties props;
    private final ProviderCalls calls;
    private final WhatsAppOptOuts optOuts;

    WhatsAppDecisionMessenger(WhatsAppClient client, WhatsAppProperties props, ProviderCalls calls,
            WhatsAppOptOuts optOuts) {
        this.client = client;
        this.props = props;
        this.calls = calls;
        this.optOuts = optOuts;
    }

    @Override
    public void sendIdentityDecision(String mobile, String line) {
        send(OPERATION, "Identity decision", "identity-template-name", props.identityTemplateName(),
                props.identityTemplateLang(), props.phoneNumberId(), mobile, List.of(line));
    }

    @Override
    public boolean sendWaitingDigest(String mobile, String waiting) {
        return send(DecisionMessenger.WAITING_DIGEST, "Waiting digest", "digest-template-name",
                props.digestTemplateName(), props.digestTemplateLang(), props.phoneNumberId(), mobile,
                List.of(waiting));
    }

    @Override
    public boolean sendOwnerNotice(String mobile, String tenantName, String place, String link) {
        return send(DecisionMessenger.OWNER_NOTICE, "Owner notice", "owner-notice-template-name",
                props.ownerNoticeTemplateName(), props.ownerNoticeTemplateLang(), props.ownerNoticeSender(),
                mobile, List.of(tenantName, place, link));
    }

    @Override
    public boolean sendServiceAttention(String mobile, String service) {
        return send(DecisionMessenger.SERVICE_ATTENTION, "Service attention", "service-template-name",
                props.serviceTemplateName(), props.serviceTemplateLang(), props.phoneNumberId(), mobile,
                List.of(service));
    }

    @Override
    public boolean sendAgreementInvite(String mobile, String inviter, String side, String place, String link) {
        return send(DecisionMessenger.AGREEMENT_INVITE, "Agreement invite", "agreement-invite-template-name",
                props.agreementInviteTemplateName(), props.agreementInviteTemplateLang(), props.phoneNumberId(),
                mobile, List.of(inviter, side, place, link));
    }

    private boolean send(String operation, String what, String property, String template, String lang,
            String fromNumberId, String mobile, List<String> parameters) {
        if (isBlank(template) || isBlank(lang)) {
            log.info("{} for {} not sent on WhatsApp: {} unset", what, MobileMask.mask(mobile), property);
            calls.record(ProviderCalls.WHATSAPP, operation, ProviderCalls.Outcome.SKIPPED, mobile, null,
                    "template unset", null);
            return false;
        }
        if (optOuts.isOptedOut(mobile)) {
            log.info("{} for {} not sent on WhatsApp: the number replied STOP", what, MobileMask.mask(mobile));
            calls.record(ProviderCalls.WHATSAPP, operation, ProviderCalls.Outcome.SKIPPED, mobile, null,
                    "opted out", null);
            return false;
        }
        Map<String, Object> payload = Map.of(
                "messaging_product", "whatsapp",
                "recipient_type", "individual",
                "to", COUNTRY_CODE + mobile,
                "type", "template",
                "template", Map.of(
                        "name", template,
                        "language", Map.of("code", lang),
                        "components", List.of(
                                Map.of("type", "body",
                                        "parameters", parameters.stream()
                                                .map(p -> Map.of("type", "text", "text", p)).toList()))));
        try {
            calls.track(ProviderCalls.WHATSAPP, operation, mobile, null,
                    () -> client.post("/" + fromNumberId + "/messages", payload));
            return true;
        } catch (WhatsAppClient.WhatsAppException e) {
            log.warn("{} WhatsApp send failed for {}", what, MobileMask.mask(mobile), e);
            return false;
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
