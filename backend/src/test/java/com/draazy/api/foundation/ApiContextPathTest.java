package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

// A real container, since MockMvc ignores server.servlet.context-path and would pass with the property removed.
// The JDK HttpClient is used because TestRestTemplate is not a declared dependency in Boot 4.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DisplayName("The /api prefix — served by the container, not invented by the dev proxy")
class ApiContextPathTest {

    @LocalServerPort
    int port;

    private int statusOf(String path) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:" + port + path))
                    .GET()
                    .build();
            return client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
        }
    }

    @Test
    @DisplayName("a public route answers under /api")
    void publicRouteIsServedUnderTheApiPrefix() throws Exception {
        assertThat(statusOf("/api/properties")).isEqualTo(200);
    }

    // The negative half matters: mapping the controllers at both prefixes would reintroduce the drift.
    @Test
    @DisplayName("the same route is not also served without the prefix")
    void unprefixedRouteIsNotServed() throws Exception {
        assertThat(statusOf("/properties"))
                .as("mapping the API at both prefixes would hide the drift this pins")
                .isEqualTo(404);
    }

    // Probes must target the prefixed path: the container prefixes infrastructure routes too.
    @Test
    @DisplayName("the health probe moves under the prefix with everything else")
    void healthProbeIsAlsoPrefixed() throws Exception {
        assertThat(statusOf("/api/actuator/health")).isEqualTo(200);
    }

    @Test
    @DisplayName("docs redirects carry a relative Location, never the container's host or scheme")
    void docsRedirectsAreRelative() throws Exception {
        for (String path : new String[] {"/api/", "/api/docs", "/api/swagger-ui"}) {
            try (HttpClient client = HttpClient.newHttpClient()) {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:" + port + path))
                        .GET()
                        .build();
                HttpResponse<Void> response = client.send(request, HttpResponse.BodyHandlers.discarding());

                assertThat(response.statusCode()).as(path).isBetween(300, 399);
                assertThat(response.headers().firstValue("Location")).as(path)
                        .hasValue("/api/docs/index.html");
            }
        }
    }
}
