package com.draazy.api.common.config;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

// A UI on a different site silently drops the SameSite=Lax refresh cookie, signing everyone out
// after 15 minutes with no log line; dev proxies hide it, so fail at boot.
@Component
public class CookieDeliveryCheck {
    private static final Logger log = LoggerFactory.getLogger(CookieDeliveryCheck.class);

    private static final Set<String> MULTI_LABEL_SUFFIXES = Set.of(
            "netlify.app", "vercel.app", "pages.dev", "github.io", "herokuapp.com",
            "onrender.com", "fly.dev", "azurewebsites.net", "web.app", "firebaseapp.com",
            "co.in", "net.in", "org.in", "co.uk", "com.au");

    private final String publicOrigin;
    private final List<String> allowedOrigins;
    private final String sameSite;

    CookieDeliveryCheck(
            @Value("${draazy.web.public-origin:}") String publicOrigin,
            @Value("${draazy.web.cors.allowed-origins:http://localhost:5173}") List<String> allowedOrigins,
            @Value("${draazy.security.refresh-cookie.same-site:Lax}") String sameSite) {
        this.publicOrigin = publicOrigin;
        this.allowedOrigins = allowedOrigins;
        this.sameSite = sameSite;
    }

    @PostConstruct
    void verify() {
        if (!"lax".equalsIgnoreCase(sameSite) && !"strict".equalsIgnoreCase(sameSite)) {
            log.warn("Refresh cookie is SameSite={} — cross-site delivery works, but /auth/refresh "
                    + "is then reachable by a forged cross-site POST and needs a CSRF defence of its "
                    + "own. Same-site delivery (SameSite=Lax) is the configuration this service was "
                    + "designed around.", sameSite);
            return;
        }
        if (publicOrigin.isBlank()) {
            log.info("draazy.web.public-origin is unset — skipping the refresh-cookie delivery "
                    + "check. Set it in any environment where the UI is not served through a proxy "
                    + "in front of this service.");
            return;
        }

        String apiSite = siteOf(publicOrigin);
        List<String> unreachable = new ArrayList<>();
        for (String origin : allowedOrigins) {
            if (!apiSite.equals(siteOf(origin))) {
                unreachable.add(origin);
            }
        }
        if (unreachable.isEmpty()) {
            log.info("Refresh cookie delivery verified: {} is same-site with {}", publicOrigin, allowedOrigins);
            warnIfSessionHintIsUnreadable();
            return;
        }
        throw new IllegalStateException(
                "Refresh-cookie delivery is impossible for these origins: " + unreachable
                        + ". They are cross-site with the API at " + publicOrigin + " (site '" + apiSite
                        + "'), so the browser will not attach the SameSite=Lax "
                        + "draazy_rt cookie to POST /auth/refresh and every session will die at the "
                        + "first access-token expiry — silently, with no server-side symptom. "
                        + "Serve the UI from the same registrable domain: either proxy /api through the "
                        + "UI's own host, or move the UI to a sibling subdomain of " + apiSite + ". "
                        + "Set draazy.web.public-origin to this service's browser-facing origin, and "
                        + "draazy.web.cors.allowed-origins (WEB_ORIGINS) to the UI's.");
    }

    // Do not set a Domain on the session hint or drop __Host-: any sibling host could write a twin cookie.
    private void warnIfSessionHintIsUnreadable() {
        List<String> unreadable = new ArrayList<>();
        String apiHost = hostOf(publicOrigin);
        for (String origin : allowedOrigins) {
            if (!apiHost.equals(hostOf(origin))) {
                unreadable.add(origin);
            }
        }
        if (unreadable.isEmpty()) {
            return;
        }
        log.warn("Session-hint cookie is unreadable from these origins: {}. They are same-site with "
                + "the API at {} — so refresh works — but not same-host, and the readable "
                + "draazy_session hint is host-only (__Host- forbids a Domain attribute). Safari's "
                + "ITP clears script-written storage after seven days without interaction; without "
                + "the hint the app cannot tell that a still-valid 30-day refresh cookie is worth "
                + "trying, and those visitors are shown a signed-out app instead of being restored. "
                + "To enable the recovery, serve the UI and this API from one origin behind a path "
                + "proxy. Do NOT give the hint a Domain: that reopens cookie-shadowing from every "
                + "sibling host.", unreadable, publicOrigin);
    }

    private static String hostOf(String origin) {
        String raw = origin.trim().toLowerCase(Locale.ROOT);
        try {
            URI uri = URI.create(raw);
            return uri.getHost() != null ? uri.getHost() : raw;
        } catch (IllegalArgumentException e) {
            return raw;
        }
    }

    private static String siteOf(String origin) {
        String host;
        try {
            URI uri = URI.create(origin.trim());
            host = uri.getHost() != null ? uri.getHost() : origin.trim();
        } catch (IllegalArgumentException e) {
            host = origin.trim();
        }
        host = host.toLowerCase(Locale.ROOT);

        String[] labels = host.split("\\.");
        if (labels.length < 3) {
            return host;
        }
        String lastTwo = labels[labels.length - 2] + "." + labels[labels.length - 1];
        if (MULTI_LABEL_SUFFIXES.contains(lastTwo)) {
            return labels[labels.length - 3] + "." + lastTwo;
        }
        return lastTwo;
    }
}
