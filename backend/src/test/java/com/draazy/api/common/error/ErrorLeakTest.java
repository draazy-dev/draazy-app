package com.draazy.api.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

// Raw sockets, not MockMvc or HttpClient: these requests are refused by Tomcat or the Spring Security firewall
// before GlobalExceptionHandler, and a real client would normalise them before they are sent.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DisplayName("Error leak baseline — container-level refusals name no internals")
class ErrorLeakTest {

    private static final Pattern LEAK = Pattern.compile(
            "(?i)exception|\\bat [a-z]+\\.[a-z]|org\\.(springframework|hibernate|postgresql|apache)|"
                    + "com\\.draazy|sqlstate|\\.java:|stack ?trace|apache tomcat|tomcat/\\d|jakarta\\.");

    @LocalServerPort
    int port;

    private String raw(String requestTarget) throws Exception {
        try (Socket socket = new Socket("localhost", port)) {
            socket.setSoTimeout(10_000);
            OutputStream out = socket.getOutputStream();
            out.write(("GET " + requestTarget + " HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
                    .getBytes(StandardCharsets.ISO_8859_1));
            out.flush();
            InputStream in = socket.getInputStream();
            return new String(in.readAllBytes(), StandardCharsets.ISO_8859_1);
        }
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "/api/properties/%zz",
            "/api/properties/..;/admin",
            "/api/properties/%2e%2e/admin",
            "/api/properties%2F..%2Fadmin",
            "/api/properties/%25",
            "/api/properties/a%00b",
            "/api/properties/a\\b",
            "/api/error",
            "/api/admin/settings"})
    @DisplayName("is refused with a 4xx and no framework, server or stack detail")
    void refusedWithoutInternals(String target) throws Exception {
        String response = raw(target);
        int status = Integer.parseInt(response.substring(9, 12));

        assertThat(status).as(response).isBetween(400, 499);
        assertThat(LEAK.matcher(response).find()).as(response).isFalse();
    }

    // Spring Security refuses without an exception, so the probes above stay green even with detail on;
    // the only way to leak is a profile file switching it on, and that is what this catches.
    @Test
    @DisplayName("no profile file turns error detail on")
    void noProfileEnablesErrorDetail() throws Exception {
        Path resources = Path.of(System.getProperty("basedir", "")).toAbsolutePath().resolve("src/main/resources");
        try (Stream<Path> files = Files.list(resources)) {
            for (Path p : files.filter(f -> f.getFileName().toString().matches("application.*\\.properties")).toList()) {
                assertThat(Files.readString(p))
                        .as(p.getFileName().toString())
                        .doesNotContainPattern("(?m)^\\s*server\\.error\\.include-[a-z-]+\\s*=\\s*(always|on[-_]param|true)");
            }
        }
    }
}
