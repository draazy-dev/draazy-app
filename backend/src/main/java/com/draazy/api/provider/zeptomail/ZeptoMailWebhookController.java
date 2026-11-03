package com.draazy.api.provider.zeptomail;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Routes;
import com.draazy.api.provider.ProviderCalls;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@RestController
class ZeptoMailWebhookController {
    static final String OPERATION = "webhook";
    static final String DELIVERY = "delivery";

    private static final Logger log = LoggerFactory.getLogger(ZeptoMailWebhookController.class);

    private final ZeptoMailWebhookSignature signature;
    private final ProviderCalls calls;
    private final ObjectMapper objectMapper;

    ZeptoMailWebhookController(ZeptoMailWebhookSignature signature, ProviderCalls calls, ObjectMapper objectMapper) {
        this.signature = signature;
        this.calls = calls;
        this.objectMapper = objectMapper;
    }

    // Like the WhatsApp webhook, a refused signature answers 200 and only logs.
    @PostMapping(Routes.Webhooks.ZEPTOMAIL)
    @ResponseStatus(HttpStatus.OK)
    void receive(@RequestHeader(name = "producer-signature", required = false) String header,
            @RequestBody(required = false) byte[] rawBody) {
        if (!signature.configured()) {
            throw new NotFoundException("Not found");
        }
        String payload = rawBody == null ? null : ZeptoMailWebhookSignature.payload(rawBody);
        if (!signature.verifies(header, payload)) {
            log.warn("ZeptoMail webhook refused: signature mismatch or stale timestamp");
            return;
        }
        JsonNode root;
        try {
            root = objectMapper.readTree(payload);
        } catch (JacksonException unreadable) {
            log.warn("Signed ZeptoMail webhook was not JSON");
            calls.record(ProviderCalls.ZEPTOMAIL, OPERATION, ProviderCalls.Outcome.FAILED, null, null,
                    "unreadable", null);
            return;
        }
        String event = first(root.path("event_name")).asString("").toLowerCase(Locale.ROOT);
        if (!event.contains("bounce") && !event.contains("feedback")) {
            return;
        }
        for (JsonNode message : each(root.path("event_message"))) {
            recordFailedDelivery(event, message);
        }
    }

    private void recordFailedDelivery(String event, JsonNode message) {
        JsonNode info = message.path("email_info");
        String subject = info.path("subject").asString(null);
        Set<String> recipients = new LinkedHashSet<>();
        String reason = null;
        for (JsonNode data : each(message.path("event_data"))) {
            for (JsonNode detail : each(data.path("details"))) {
                String bounced = detail.path("bounced_recipient").asString(null);
                if (bounced != null) {
                    recipients.add(bounced);
                }
                reason = reason != null ? reason : detail.path("reason").asString(null);
            }
        }
        if (recipients.isEmpty()) {
            info.path("to").forEach(to -> {
                String address = to.path("email_address").path("address").asString(null);
                if (address != null) {
                    recipients.add(address);
                }
            });
        }
        String detail = reason == null ? event : event + " " + reason;
        for (String recipient : recipients) {
            calls.record(ProviderCalls.ZEPTOMAIL, DELIVERY, ProviderCalls.Outcome.FAILED, recipient, subject,
                    detail, null);
        }
    }

    private static JsonNode first(JsonNode node) {
        return node.isArray() ? node.path(0) : node;
    }

    private static Iterable<JsonNode> each(JsonNode node) {
        return node.isArray() ? node : node.isMissingNode() || node.isNull() ? Set.of() : Set.of(node);
    }
}
