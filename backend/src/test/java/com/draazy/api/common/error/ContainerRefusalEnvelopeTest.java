package com.draazy.api.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

// Raw sockets: a real client would normalise these targets before sending them.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DisplayName("Container-level refusals answer with the JSON error envelope")
class ContainerRefusalEnvelopeTest {

    @LocalServerPort
    int port;

    private String raw(String requestTarget) throws Exception {
        try (Socket socket = new Socket("localhost", port)) {
            socket.setSoTimeout(10_000);
            OutputStream out = socket.getOutputStream();
            out.write(("GET " + requestTarget + " HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
                    .getBytes(StandardCharsets.ISO_8859_1));
            out.flush();
            return new String(socket.getInputStream().readAllBytes(), StandardCharsets.ISO_8859_1);
        }
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "/api/properties%2F..%2Fadmin",
            "/api/properties/a%2Fb",
            "/api/properties/%2e%2e/admin",
            "/api/properties/..;/admin",
            "/api/properties/%zz",
            "/api/properties/a%00b"})
    void isJsonNotAnHtmlErrorPage(String target) throws Exception {
        String response = raw(target);
        int status = Integer.parseInt(response.substring(9, 12));
        String head = response.substring(0, response.indexOf("\r\n\r\n")).toLowerCase();
        String body = response.substring(response.indexOf("\r\n\r\n") + 4);

        assertThat(status).as(response).isBetween(400, 499);
        assertThat(head).as(response).contains("content-type: application/json");
        assertThat(body).as(response).contains("\"error\"").contains("\"message\"")
                .contains("\"status\":" + status);
    }
}
