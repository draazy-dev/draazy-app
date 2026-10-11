package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import jakarta.servlet.http.HttpServletRequest;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "draazy.security.origin-secret=" + OriginGateTest.SECRET)
@AutoConfigureMockMvc
@DisplayName("Origin gate — only our edge proxy may call the API")
class OriginGateTest {

    static final String SECRET = "test-only-origin-secret-at-least-32-chars";

    @Autowired
    MockMvc mvc;

    @Test
    void aRequestWithoutTheSecretIsRefusedEvenOnAPublicRoute() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("forbidden"));
    }

    @Test
    void aWrongSecretIsRefused() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE).header(OriginGateFilter.HEADER, SECRET + "x"))
                .andExpect(status().isForbidden());
    }

    @Test
    void theProxysSecretIsLetThrough() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE).header(OriginGateFilter.HEADER, SECRET))
                .andExpect(status().isOk());
    }

    @Test
    void healthProbesNeedNoSecret() throws Exception {
        mvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().is(Matchers.not(403)));
    }

    @Test
    void writesToAProbePathStillNeedTheSecret() throws Exception {
        mvc.perform(post("/actuator/health")).andExpect(status().isForbidden());
        mvc.perform(put("/actuator/health/liveness")).andExpect(status().isForbidden());
        mvc.perform(delete("/actuator/health/readiness")).andExpect(status().isForbidden());
    }

    @Test
    void aBlankSettingFailsTheBootRatherThanTurningTheGateOff() {
        assertThatThrownBy(() -> OriginGateFilter.fromSetting(" "))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("draazy.security.origin-secret");
    }

    @Test
    void aGuessableSecretFailsTheBoot() {
        assertThatThrownBy(() -> OriginGateFilter.fromSetting("short"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("at least");
    }

    @Test
    void noneTurnsTheGateOff() {
        assertThat(OriginGateFilter.fromSetting("NONE")).isEmpty();
    }

    @Test
    void downstreamSeesTheFirstForwardedHopAsTheCaller() throws Exception {
        MockHttpServletRequest request = proxied("1.2.3.4, 5.6.7.8", SECRET);

        HttpServletRequest seen = run(request).request;

        assertThat(seen.getRemoteAddr()).isEqualTo("1.2.3.4");
        assertThat(seen.getRemoteHost()).isEqualTo("1.2.3.4");
    }

    @Test
    void theSocketAddressStandsWhenNothingWasForwarded() throws Exception {
        assertThat(run(proxied(null, SECRET)).request.getRemoteAddr()).isEqualTo("10.9.8.7");
        assertThat(run(proxied("  ", SECRET)).request.getRemoteAddr()).isEqualTo("10.9.8.7");
    }

    @Test
    void aForgedForwardedHeaderWithoutTheSecretIsStillRefused() throws Exception {
        Outcome outcome = run(proxied("1.2.3.4", SECRET + "x"));

        assertThat(outcome.request).isNull();
        assertThat(outcome.response.getStatus()).isEqualTo(403);
    }

    private record Outcome(HttpServletRequest request, MockHttpServletResponse response) {
    }

    private static MockHttpServletRequest proxied(String forwardedFor, String secret) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/anything");
        request.setRemoteAddr("10.9.8.7");
        request.addHeader(OriginGateFilter.HEADER, secret);
        if (forwardedFor != null) {
            request.addHeader("X-Forwarded-For", forwardedFor);
        }
        return request;
    }

    private static Outcome run(MockHttpServletRequest request) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        OriginGateFilter.fromSetting(SECRET).orElseThrow().doFilter(request, response, chain);
        return new Outcome((HttpServletRequest) chain.getRequest(), response);
    }}
