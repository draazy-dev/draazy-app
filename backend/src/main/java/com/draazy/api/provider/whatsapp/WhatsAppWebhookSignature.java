package com.draazy.api.provider.whatsapp;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Meta signs each callback with the app secret ({@code X-Hub-Signature-256}); the verify token only
 * answers the one-off subscribe handshake. Unset, the webhook route answers 404. */
@Component
class WhatsAppWebhookSignature {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppWebhookSignature.class);
    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final String PREFIX = "sha256=";
    private static final int MIN_VERIFY_TOKEN_LENGTH = 16;

    private final byte[] appSecret;
    private final byte[] verifyToken;

    WhatsAppWebhookSignature(@Value("${draazy.providers.whatsapp.app-secret:}") String appSecret,
            @Value("${draazy.providers.whatsapp.webhook-verify-token:}") String verifyToken,
            @Value("${draazy.providers.whatsapp.enabled:false}") boolean whatsAppEnabled) {
        boolean secretSet = appSecret != null && !appSecret.isBlank();
        boolean tokenSet = verifyToken != null && !verifyToken.isBlank();
        if (secretSet != tokenSet) {
            throw new IllegalStateException("Set both WHATSAPP_APP_SECRET and WHATSAPP_WEBHOOK_VERIFY_TOKEN, or neither: "
                    + "the webhook needs the token to subscribe and the secret to trust a callback.");
        }
        if (tokenSet && verifyToken.length() < MIN_VERIFY_TOKEN_LENGTH) {
            throw new IllegalStateException("WHATSAPP_WEBHOOK_VERIFY_TOKEN must be at least " + MIN_VERIFY_TOKEN_LENGTH
                    + " random characters; the subscribe handshake is public, so a short one can be guessed.");
        }
        if (whatsAppEnabled && !secretSet) {
            log.warn("WhatsApp is live but its webhook is off (WHATSAPP_APP_SECRET unset): a STOP reply is not honoured "
                    + "and failed deliveries are not recorded.");
        }
        this.appSecret = secretSet ? appSecret.getBytes(StandardCharsets.UTF_8) : null;
        this.verifyToken = tokenSet ? verifyToken.getBytes(StandardCharsets.UTF_8) : null;
    }

    boolean configured() {
        return appSecret != null;
    }

    boolean acceptsVerifyToken(String token) {
        return configured() && token != null
                && MessageDigest.isEqual(verifyToken, token.getBytes(StandardCharsets.UTF_8));
    }

    boolean verifies(String header, byte[] rawBody) {
        if (!configured() || header == null || rawBody == null || !header.startsWith(PREFIX)) {
            return false;
        }
        byte[] presented;
        try {
            presented = HexFormat.of().parseHex(header.substring(PREFIX.length()));
        } catch (IllegalArgumentException notHex) {
            return false;
        }
        return MessageDigest.isEqual(hmac(rawBody), presented);
    }

    /** Exists so tests run the real check rather than a mock of it. */
    String sign(byte[] rawBody) {
        return PREFIX + HexFormat.of().formatHex(hmac(rawBody));
    }

    private byte[] hmac(byte[] rawBody) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(appSecret, HMAC_SHA256));
            return mac.doFinal(rawBody);
        } catch (GeneralSecurityException noHmac) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", noHmac);
        }
    }
}
