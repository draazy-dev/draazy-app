package com.draazy.api.provider.zeptomail;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class ZeptoMailWebhookSignature {
    private static final Logger log = LoggerFactory.getLogger(ZeptoMailWebhookSignature.class);
    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final Duration MAX_SKEW = Duration.ofMinutes(5);

    private final byte[] key;
    private final Clock clock;

    ZeptoMailWebhookSignature(@Value("${draazy.providers.zeptomail.webhook-key:}") String key,
            @Value("${draazy.providers.zeptomail.enabled:false}") boolean zeptoMailEnabled, Clock clock) {
        boolean keySet = key != null && !key.isBlank();
        if (zeptoMailEnabled && !keySet) {
            log.warn("ZeptoMail is live but its webhook is off (ZEPTOMAIL_WEBHOOK_KEY unset): bounces and spam "
                    + "complaints are not recorded.");
        }
        this.key = keySet ? key.getBytes(StandardCharsets.UTF_8) : null;
        this.clock = clock;
    }

    boolean configured() {
        return key != null;
    }

    // Zoho posts the event as one form parameter and signs its decoded value, not the raw body.
    static String payload(byte[] rawBody) {
        String body = new String(rawBody, StandardCharsets.UTF_8);
        if (body.stripLeading().startsWith("{")) {
            return body;
        }
        int separator = body.indexOf('=');
        return separator < 0 ? null : URLDecoder.decode(body.substring(separator + 1), StandardCharsets.UTF_8);
    }

    boolean verifies(String header, String payload) {
        if (!configured() || header == null || payload == null) {
            return false;
        }
        Map<String, String> parts = new HashMap<>();
        for (String part : header.split(";")) {
            String[] pair = part.split("=", 2);
            if (pair.length == 2) {
                parts.put(pair[0].strip(), pair[1].strip());
            }
        }
        if (!HMAC_SHA256.equals(parts.get("s-algorithm")) || parts.get("s") == null || !fresh(parts.get("ts"))) {
            return false;
        }
        byte[] presented;
        try {
            presented = Base64.getDecoder().decode(URLDecoder.decode(parts.get("s"), StandardCharsets.UTF_8));
        } catch (IllegalArgumentException notBase64) {
            return false;
        }
        return MessageDigest.isEqual(hmac(payload), presented);
    }

    String sign(String payload, long timestampMillis) {
        return "ts=" + timestampMillis + ";s=" + Base64.getEncoder().encodeToString(hmac(payload))
                + ";s-algorithm=" + HMAC_SHA256;
    }

    private boolean fresh(String timestampMillis) {
        try {
            long skew = Math.abs(clock.millis() - Long.parseLong(timestampMillis));
            return skew <= MAX_SKEW.toMillis();
        } catch (NumberFormatException notMillis) {
            return false;
        }
    }

    private byte[] hmac(String payload) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(key, HMAC_SHA256));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException noHmac) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", noHmac);
        }
    }
}
