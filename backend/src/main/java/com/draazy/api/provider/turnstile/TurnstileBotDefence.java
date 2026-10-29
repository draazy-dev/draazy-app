package com.draazy.api.provider.turnstile;

import com.draazy.api.security.BotDefence;
import java.time.Duration;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

@Component
@ConditionalOnProperty(prefix = "draazy.security.turnstile", name = "enabled",
        havingValue = "true")
public class TurnstileBotDefence implements BotDefence {
    private static final Logger log = LoggerFactory.getLogger(TurnstileBotDefence.class);

    public static final String DEFAULT_VERIFY_URL =
            "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    private final RestClient http;
    private final String secretKey;

    public TurnstileBotDefence(
            @Value("${draazy.security.turnstile.secret-key:}") String secretKey,
            @Value("${draazy.security.turnstile.verify-url:" + DEFAULT_VERIFY_URL + "}")
            String verifyUrl,
            @Value("${draazy.security.turnstile.connect-timeout-seconds:3}") long connectSeconds,
            @Value("${draazy.security.turnstile.read-timeout-seconds:5}") long readSeconds) {
        if (secretKey == null || secretKey.isBlank()) {
            throw new IllegalStateException(
                    "draazy.security.turnstile.enabled=true but secret-key is not set "
                            + "(TURNSTILE_SECRET_KEY). Either supply the secret or leave the flag "
                            + "off to run without a challenge.");
        }
        SimpleClientHttpRequestFactory timeouts = new SimpleClientHttpRequestFactory();
        timeouts.setConnectTimeout(Duration.ofSeconds(connectSeconds));
        timeouts.setReadTimeout(Duration.ofSeconds(readSeconds));

        this.secretKey = secretKey;
        this.http = RestClient.builder()
                .requestFactory(timeouts)
                .baseUrl(verifyUrl)
                .build();
    }

    @Override
    public boolean enforced() {
        return true;
    }

    @Override
    public boolean verify(String token, String remoteIp) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("secret", secretKey);
        form.add("response", token);
        if (remoteIp != null && !remoteIp.isBlank()) {
            form.add("remoteip", remoteIp);
        }
        try {
            Map<?, ?> body = http.post()
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(Map.class);
            if (body == null) {
                log.warn("Turnstile returned an empty body; refusing the request");
                return false;
            }
            boolean ok = Boolean.TRUE.equals(body.get("success"));
            if (!ok) {
                log.warn("Turnstile rejected a token: {}", body.get("error-codes"));
            }
            return ok;
        } catch (RuntimeException e) {
            log.error("Turnstile verification failed; refusing the request", e);
            return false;
        }
    }
}
