package com.draazy.api.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class CookieDeliveryCheckTest {
    private static CookieDeliveryCheck check(String publicOrigin, List<String> allowed) {
        return new CookieDeliveryCheck(publicOrigin, allowed, "Lax");
    }

    @Test
    @DisplayName("a UI proxied on the API's own origin passes")
    void sameOriginPasses() {
        assertThatCode(() -> check("https://draazy.com", List.of("https://draazy.com")).verify())
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("sibling subdomains pass — cross-origin, but same-site, so Lax is still delivered")
    void siblingSubdomainsPass() {
        assertThatCode(() -> check("https://api.draazy.com",
                List.of("https://www.draazy.com", "https://draazy.com")).verify())
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("a UI on its own registrable domain refuses to boot")
    void crossSiteFails() {
        assertThatThrownBy(() -> check("https://api.draazy.com",
                List.of("https://draazy.netlify.app")).verify())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("https://draazy.netlify.app")
                .hasMessageContaining("proxy /api");
    }

    @Test
    @DisplayName("two subdomains of a public suffix are different sites")
    void publicSuffixSubdomainsAreNotSameSite() {
        assertThatThrownBy(() -> check("https://api.netlify.app",
                List.of("https://draazy.netlify.app")).verify())
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("one bad origin among good ones still fails, and names only itself")
    void aSingleStrayOriginIsEnough() {
        assertThatThrownBy(() -> check("https://api.draazy.com",
                List.of("https://www.draazy.com", "https://staging.draazy.dev")).verify())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("staging.draazy.dev")
                .hasMessageNotContaining("www.draazy.com");
    }

    @Test
    @DisplayName("an unset public origin skips the check rather than failing it")
    void unsetPublicOriginSkips() {
        assertThatCode(() -> check("", List.of("http://localhost:5173")).verify())
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("SameSite=None is not held to the same-site rule")
    void sameSiteNoneSkips() {
        assertThatCode(() -> new CookieDeliveryCheck("https://api.draazy.com",
                List.of("https://draazy.netlify.app"), "None").verify())
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("localhost compares by host, ports and schemes ignored")
    void localhostComparesByHost() {
        assertThatCode(() -> check("http://localhost:8080", List.of("http://localhost:5173")).verify())
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> check("http://localhost:8080", List.of("http://127.0.0.1:5173")).verify())
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("the failure message names the site it computed, not just the origins")
    void theMessageExplainsTheComparison() {
        assertThat(catchMessage(() -> check("https://api.draazy.com",
                List.of("https://draazy.netlify.app")).verify()))
                .contains("draazy.com")
                .contains("SameSite=Lax")
                .contains("draazy.web.public-origin");
    }

    @Test
    @DisplayName("sibling subdomains warn that the session hint cannot be read")
    void siblingSubdomainsWarnAboutTheHint() {
        ListAppender<ILoggingEvent> heard = captureLogs();
        check("https://api.draazy.com", List.of("https://www.draazy.com")).verify();

        assertThat(heard.list)
                .filteredOn(e -> e.getLevel() == Level.WARN)
                .singleElement()
                .satisfies(e -> {
                    String message = e.getFormattedMessage();
                    assertThat(message).contains("https://www.draazy.com");
                    assertThat(message).contains("path proxy");
                    assertThat(message).contains("Do NOT give the hint a Domain");
                });
    }

    @Test
    @DisplayName("a proxied UI is silent — a warning that fires on a healthy setup is one nobody reads")
    void theProxiedTopologyWarnsAboutNothing() {
        ListAppender<ILoggingEvent> heard = captureLogs();
        check("https://draazy.com", List.of("https://draazy.com")).verify();

        assertThat(heard.list).filteredOn(e -> e.getLevel() == Level.WARN).isEmpty();
    }

    private static ListAppender<ILoggingEvent> captureLogs() {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logbackLogger().addAppender(appender);
        return appender;
    }

    @AfterEach
    void detachCapture() {
        logbackLogger().detachAndStopAllAppenders();
    }

    private static ch.qos.logback.classic.Logger logbackLogger() {
        return (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(CookieDeliveryCheck.class);
    }

    private static String catchMessage(Runnable r) {
        try {
            r.run();
            throw new AssertionError("expected the check to reject this configuration");
        } catch (IllegalStateException e) {
            return e.getMessage();
        }
    }
}
