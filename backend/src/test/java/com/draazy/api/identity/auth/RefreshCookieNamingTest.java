package com.draazy.api.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.security.JwtProperties;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseCookie;
import org.springframework.mock.web.MockHttpServletRequest;

@DisplayName("Refresh cookie naming — the __Host- prefix and what it demands")
class RefreshCookieNamingTest {
    private static final JwtProperties JWT =
            new JwtProperties("x".repeat(48), Duration.ofMinutes(15), Duration.ofDays(30), Duration.ofSeconds(15));

    private static RefreshCookie secure(boolean secure) {
        return new RefreshCookie(JWT, secure, "Lax");
    }

    @Test
    void aSecureDeploymentPrefixesBothCookies() {
        RefreshCookie cookie = secure(true);
        assertThat(cookie.name()).isEqualTo("__Host-draazy_rt");
        assertThat(cookie.hintName()).isEqualTo("__Host-draazy_session");
    }

    @Test
    void plainHttpDevelopmentKeepsTheBareNames() {
        RefreshCookie cookie = secure(false);
        assertThat(cookie.name()).isEqualTo("draazy_rt");
        assertThat(cookie.hintName()).isEqualTo("draazy_session");
    }

    @Test
    void everyPrefixedCookieMeetsTheHostRules() {
        RefreshCookie cookie = secure(true);
        for (ResponseCookie c : new ResponseCookie[] {
                cookie.issued("token", true), cookie.issued("token", false), cookie.cleared(),
                cookie.issuedHint(true), cookie.issuedHint(false), cookie.clearedHint() }) {
            assertThat(c.getName()).startsWith("__Host-");
            assertThat(c.isSecure())
                    .as("%s: a __Host- cookie without Secure is rejected outright", c.getName())
                    .isTrue();
            assertThat(c.getPath())
                    .as("%s: __Host- mandates Path=/, and the hint additionally needs it to be "
                            + "readable from whatever page the visitor landed on", c.getName())
                    .isEqualTo("/");
            assertThat(c.getDomain())
                    .as("%s: any Domain at all voids the prefix — and the domain cookie is exactly "
                            + "the attack it exists to stop", c.getName())
                    .isNull();
        }
    }

    @Test
    void aDuplicatedCookieIsRefusedRatherThanChosenBetween() {
        RefreshCookie cookie = secure(false);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie("draazy_rt", "ours"), new Cookie("draazy_rt", "planted"));

        assertThat(cookie.presented(request)).isNull();
    }

    @Test
    void theTokenIsReadUnderWhicheverNameThisDeploymentUses() {
        MockHttpServletRequest prod = new MockHttpServletRequest();
        prod.setCookies(new Cookie("__Host-draazy_rt", "token"), new Cookie("draazy_rt", "stale"));
        assertThat(secure(true).presented(prod))
                .as("the unprefixed leftover of a pre-prefix session must not be mistaken for the real one")
                .isEqualTo("token");

        MockHttpServletRequest dev = new MockHttpServletRequest();
        dev.setCookies(new Cookie("draazy_rt", "token"));
        assertThat(secure(false).presented(dev)).isEqualTo("token");
    }

    @Test
    void anAbsentOrEmptyCookieReadsAsNoSession() {
        RefreshCookie cookie = secure(false);
        assertThat(cookie.presented(new MockHttpServletRequest())).isNull();

        MockHttpServletRequest blank = new MockHttpServletRequest();
        blank.setCookies(new Cookie("draazy_rt", ""));
        assertThat(cookie.presented(blank)).isNull();

        MockHttpServletRequest other = new MockHttpServletRequest();
        other.setCookies(new Cookie("draazy_session", "1"));
        assertThat(cookie.presented(other)).isNull();
    }
}
