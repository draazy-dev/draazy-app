package com.draazy.api.provider.whatsapp;

import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.web.Routes;
import com.draazy.api.provider.ProviderCalls;
import java.time.DateTimeException;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Meta's WhatsApp callbacks: a STOP or START reply, and the delivery failures a send cannot see. */
@RestController
class WhatsAppWebhookController {

    static final String OPERATION = "webhook";
    static final String DELIVERY = "delivery";

    private static final Logger log = LoggerFactory.getLogger(WhatsAppWebhookController.class);
    private static final Pattern CHALLENGE = Pattern.compile("[A-Za-z0-9_-]{1,64}");
    private static final Set<String> OPT_OUT = Set.of("STOP", "STOP ALL", "STOP PROMOTIONS", "UNSUBSCRIBE",
            "CANCEL", "END", "QUIT", "OPT OUT", "OPTOUT");
    private static final Set<String> OPT_IN = Set.of("START", "UNSTOP", "SUBSCRIBE", "OPT IN", "OPTIN");

    private final WhatsAppWebhookSignature signature;
    private final WhatsAppOptOuts optOuts;
    private final ProviderCalls calls;
    private final ObjectMapper objectMapper;

    WhatsAppWebhookController(WhatsAppWebhookSignature signature, WhatsAppOptOuts optOuts, ProviderCalls calls,
            ObjectMapper objectMapper) {
        this.signature = signature;
        this.optOuts = optOuts;
        this.calls = calls;
        this.objectMapper = objectMapper;
    }

    @GetMapping(Routes.Webhooks.WHATSAPP)
    ResponseEntity<String> subscribe(@RequestParam(name = "hub.mode", required = false) String mode,
            @RequestParam(name = "hub.verify_token", required = false) String token,
            @RequestParam(name = "hub.challenge", required = false) String challenge) {
        requireConfigured();
        if (!"subscribe".equals(mode) || !signature.acceptsVerifyToken(token)
                || challenge == null || !CHALLENGE.matcher(challenge).matches()) {
            throw new ForbiddenException("This webhook subscription was not accepted.");
        }
        return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(challenge);
    }

    /** A refused signature answers 200 and only logs, so forged traffic cannot pose as WhatsApp failures in the
     * provider log. A failed opt-out write answers 500 instead, so Meta retries rather than the STOP being lost. */
    @PostMapping(Routes.Webhooks.WHATSAPP)
    @ResponseStatus(HttpStatus.OK)
    void receive(@RequestHeader(name = "X-Hub-Signature-256", required = false) String header,
            @RequestBody(required = false) byte[] rawBody) {
        requireConfigured();
        if (!signature.verifies(header, rawBody)) {
            log.warn("WhatsApp webhook refused: signature mismatch");
            return;
        }
        JsonNode root;
        try {
            root = objectMapper.readTree(rawBody);
        } catch (JacksonException unreadable) {
            log.warn("Signed WhatsApp webhook was not JSON");
            calls.record(ProviderCalls.WHATSAPP, OPERATION, ProviderCalls.Outcome.FAILED, null, null,
                    "unreadable", null);
            return;
        }
        for (JsonNode entry : root.path("entry")) {
            for (JsonNode change : entry.path("changes")) {
                JsonNode value = change.path("value");
                value.path("messages").forEach(this::applyOptChoice);
                value.path("statuses").forEach(this::recordFailedDelivery);
            }
        }
    }

    private void requireConfigured() {
        if (!signature.configured()) {
            throw new NotFoundException("Not found");
        }
    }

    private void applyOptChoice(JsonNode message) {
        Boolean optOut = optChoice(textOf(message));
        String mobile = MobileMask.normalise(message.path("from").asString(null));
        Instant sentAt = sentAt(message.path("timestamp").asString(null));
        if (optOut == null || mobile == null || sentAt == null) {
            return;
        }
        optOuts.record(mobile, optOut, sentAt);
        log.info("WhatsApp {} from {}", optOut ? "opt-out" : "opt-in", MobileMask.mask(mobile));
    }

    private void recordFailedDelivery(JsonNode status) {
        if (!"failed".equals(status.path("status").asString(null))) {
            return;
        }
        String code = status.path("errors").path(0).path("code").asString("unknown");
        calls.record(ProviderCalls.WHATSAPP, DELIVERY, ProviderCalls.Outcome.FAILED,
                MobileMask.normalise(status.path("recipient_id").asString(null)), null, "meta " + code, null);
    }

    private static String textOf(JsonNode message) {
        String text = message.path("text").path("body").asString(null);
        return text != null ? text : message.path("button").path("text").asString(null);
    }

    /** Whole-message keywords only, so "please don't stop" is not an opt-out. */
    static Boolean optChoice(String text) {
        if (text == null) {
            return null;
        }
        String word = text.toUpperCase(Locale.ROOT).replaceAll("[^A-Z ]", " ").trim().replaceAll("\\s+", " ");
        if (OPT_OUT.contains(word)) {
            return true;
        }
        return OPT_IN.contains(word) ? false : null;
    }

    private static Instant sentAt(String epochSeconds) {
        try {
            return epochSeconds == null ? null : Instant.ofEpochSecond(Long.parseLong(epochSeconds));
        } catch (NumberFormatException | DateTimeException notSeconds) {
            return null;
        }
    }
}
