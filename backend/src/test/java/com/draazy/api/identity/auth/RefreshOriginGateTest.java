package com.draazy.api.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.draazy.api.common.error.ForbiddenException;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.mock.web.MockHttpServletRequest;

@DisplayName("Refresh origin gate — who is allowed to rotate")
class RefreshOriginGateTest {
    private static final String OURS = "https://www.draazy.in";
    private static final String SIBLING = "https://status.draazy.in";

    private final RefreshOriginGate gate = new RefreshOriginGate(List.of(OURS));

    private static MockHttpServletRequest request(String fetchSite, String origin) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/auth/refresh");
        if (fetchSite != null) request.addHeader("Sec-Fetch-Site", fetchSite);
        if (origin != null) request.addHeader("Origin", origin);
        return request;
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("allowed")
    void allows(String label, String fetchSite, String origin) {
        assertThatCode(() -> gate.check(request(fetchSite, origin))).doesNotThrowAnyException();
    }

    static Stream<Arguments> allowed() {
        return Stream.of(
                Arguments.of("our own origin (the same-origin deployment)", "same-origin",
                        "http://localhost:8081"),
                Arguments.of("a caller that sends no fetch metadata at all", null, null),
                Arguments.of("a user-initiated navigation", "none", null),
                Arguments.of("the configured frontend when it is a same-site sibling", "same-site",
                        OURS));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("refused")
    void refuses(String label, String fetchSite, String origin) {
        assertThatThrownBy(() -> gate.check(request(fetchSite, origin)))
                .isInstanceOf(ForbiddenException.class);
    }

    static Stream<Arguments> refused() {
        return Stream.of(
                Arguments.of("an unlisted sibling subdomain — the forced sign-out", "same-site",
                        SIBLING),
                Arguments.of("a same-site request that carries no Origin", "same-site", null),
                Arguments.of("an unlisted cross-site origin", "cross-site", "https://evil.example"));
    }

    @Test
    @DisplayName("matches origins exactly, as CORS does")
    void matchesExactly() {
        assertThatThrownBy(() -> gate.check(request("same-site", OURS + "/")))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> gate.check(request("same-site", "https://WWW.draazy.in")))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("refuses with 403 and a forbidden code, not a 401")
    void refusesAsForbidden() {
        assertThatThrownBy(() -> gate.check(request("same-site", SIBLING)))
                .isInstanceOfSatisfying(ForbiddenException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(403);
                    assertThat(e.getCode()).isEqualTo("forbidden");
                    assertThat(e.getMessage()).doesNotContain(SIBLING);
                });
    }
}
