package com.draazy.api.provider.turnstile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("Turnstile verification (D130)")
class TurnstileBotDefenceTest {
    private static final String CONFIRMED = "{\"success\":true}";

    private HttpServer server;
    private final List<String> requests = new CopyOnWriteArrayList<>();

    @AfterEach
    void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    private String startServer(String body, int... failFirstWith) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/siteverify", exchange -> {
            requests.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            int call = requests.size() - 1;
            if (call < failFirstWith.length) {
                exchange.sendResponseHeaders(failFirstWith[call], -1);
            } else {
                byte[] out = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, out.length);
                exchange.getResponseBody().write(out);
            }
            exchange.close();
        });
        server.start();
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/siteverify";
    }

    private static String idempotencyKey(String form) {
        return Arrays.stream(form.split("&"))
                .filter(field -> field.startsWith("idempotency_key="))
                .map(field -> field.substring("idempotency_key=".length()))
                .findFirst()
                .orElse("");
    }

    private static TurnstileBotDefence defence(String verifyUrl) {
        return new TurnstileBotDefence("test-secret", verifyUrl, 2, 2);
    }

    @Test
    @DisplayName("accepts a token Cloudflare confirms, sending the secret, token and caller address")
    void acceptsSuccessAndSendsTheExpectedForm() throws Exception {
        TurnstileBotDefence defence = defence(startServer(CONFIRMED));

        assertThat(defence.verify("a-token", "203.0.113.9")).isTrue();
        assertThat(defence.enforced()).isTrue();
        assertThat(requests).singleElement().asString()
                .contains("secret=test-secret")
                .contains("response=a-token")
                .contains("remoteip=203.0.113.9");
    }

    @ParameterizedTest(name = "refuses {0}")
    @ValueSource(strings = {
            "{\"success\":false,\"error-codes\":[\"invalid-input-response\"]}",
            "{\"unexpected\":\"shape\"}",
            "{\"success\":\"true\"}"})
    void refusesAnythingButABooleanSuccess(String body) throws Exception {
        TurnstileBotDefence defence = defence(startServer(body));

        assertThat(defence.verify("a-token", null)).isFalse();
        assertThat(requests).as("a verdict is final, so it is not asked for twice").hasSize(1);
    }

    @Test
    @DisplayName("rides out one provider failure, re-asking under the same idempotency key")
    void retriesAServerErrorOnceUnderTheSameKey() throws Exception {
        TurnstileBotDefence defence = defence(startServer(CONFIRMED, 503));

        assertThat(defence.verify("a-token", null)).isTrue();
        assertThat(requests).hasSize(2);
        assertThat(idempotencyKey(requests.get(0))).isNotBlank()
                .as("a fresh key would make Cloudflare refuse the retry as a reused token")
                .isEqualTo(idempotencyKey(requests.get(1)));
    }

    @Test
    @DisplayName("does not retry a request Cloudflare refused as malformed")
    void doesNotRetryAClientError() throws Exception {
        TurnstileBotDefence defence = defence(startServer(CONFIRMED, 400));

        assertThat(defence.verify("a-token", null)).isFalse();
        assertThat(requests).hasSize(1);
    }

    @Test
    @DisplayName("refuses when the provider is unreachable — fail closed, and without throwing")
    void refusesWhenUnreachable() throws Exception {
        int deadPort;
        try (ServerSocket probe = new ServerSocket(0)) {
            deadPort = probe.getLocalPort();
        }
        TurnstileBotDefence defence = defence("http://127.0.0.1:" + deadPort + "/siteverify");

        assertThat(defence.verify("a-token", null))
                .as("a broken verification call must refuse, not disable the control")
                .isFalse();
    }

    @Test
    @DisplayName("still refuses when the provider stays down after the retry")
    void refusesOnServerError() throws Exception {
        TurnstileBotDefence defence = defence(startServer(CONFIRMED, 503, 503));

        assertThat(defence.verify("a-token", null)).isFalse();
        assertThat(requests).hasSize(2);
    }

    @Test
    @DisplayName("refuses to start with the flag on and no secret, rather than failing every form")
    void refusesToStartWithoutASecret() {
        assertThatThrownBy(() -> new TurnstileBotDefence("  ", "http://127.0.0.1:1/x", 1, 1))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("secret-key");
    }
}
