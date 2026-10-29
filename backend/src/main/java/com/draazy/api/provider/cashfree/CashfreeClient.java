package com.draazy.api.provider.cashfree;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
@ConditionalOnProperty(prefix = "draazy.providers.cashfree", name = "enabled", havingValue = "true")
public class CashfreeClient {
    private static final Logger log = LoggerFactory.getLogger(CashfreeClient.class);

    private final RestClient http;

    CashfreeClient(CashfreeProperties props) {
        if (isBlank(props.appId()) || isBlank(props.secretKey())) {
            throw new IllegalStateException(
                    "draazy.providers.cashfree.enabled=true but app-id/secret-key are not set "
                            + "(CASHFREE_APP_ID / CASHFREE_SECRET_KEY). Either supply the keys or "
                            + "leave the flag off to run on the mock providers.");
        }
        JdkClientHttpRequestFactory timeouts = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        timeouts.setReadTimeout(Duration.ofSeconds(10));

        this.http = RestClient.builder()
                .requestFactory(timeouts)
                .baseUrl(props.baseUrl())
                .defaultHeader("X-Client-Id", props.appId())
                .defaultHeader("X-Client-Secret", props.secretKey())
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public <T> T post(String path, String apiVersion, Object body, Class<T> responseType) {
        try {
            return http.post()
                    .uri(path)
                    .header("x-api-version", apiVersion)
                    .body(body)
                    .retrieve()
                    .body(responseType);
        } catch (RestClientException e) {
            log.error("Cashfree POST {} failed", path, e);
            throw new CashfreeException("Cashfree call failed: " + path, e);
        }
    }

    public <T> T get(String path, String apiVersion, Class<T> responseType) {
        try {
            return http.get()
                    .uri(path)
                    .header("x-api-version", apiVersion)
                    .retrieve()
                    .body(responseType);
        } catch (RestClientException e) {
            log.error("Cashfree GET {} failed", path, e);
            throw new CashfreeException("Cashfree call failed: " + path, e);
        }
    }

    public <T> T patch(String path, String apiVersion, Object body, Class<T> responseType) {
        try {
            return http.patch()
                    .uri(path)
                    .header("x-api-version", apiVersion)
                    .body(body)
                    .retrieve()
                    .body(responseType);
        } catch (RestClientException e) {
            log.error("Cashfree PATCH {} failed", path, e);
            throw new CashfreeException("Cashfree call failed: " + path, e);
        }
    }

    public static class CashfreeException extends RuntimeException {
        CashfreeException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    static Map<String, Object> json(Object... keyValuePairs) {
        Map<String, Object> map = new java.util.LinkedHashMap<>();
        for (int i = 0; i < keyValuePairs.length; i += 2) {
            map.put((String) keyValuePairs[i], keyValuePairs[i + 1]);
        }
        return map;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
