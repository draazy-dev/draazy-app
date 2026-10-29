package com.draazy.api.identity.auth;

import com.draazy.api.common.config.CorsConfig;
import com.draazy.api.common.error.ForbiddenException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

// Refuses before reading or writing any cookie: SameSite=Lax allows same-site sibling
// subdomains to rotate the token, which would trigger reuse detection and sign the victim out.
@Component
public class RefreshOriginGate {
    private static final Logger log = LoggerFactory.getLogger(RefreshOriginGate.class);

    private static final String FETCH_SITE = "Sec-Fetch-Site";
    private static final String SAME_ORIGIN = "same-origin";
    private static final String USER_INITIATED = "none";

    private final Set<String> allowedOrigins;

    RefreshOriginGate(@Value(CorsConfig.ALLOWED_ORIGINS) List<String> allowedOrigins) {
        this.allowedOrigins = Set.copyOf(allowedOrigins);
    }

    public void check(HttpServletRequest request) {
        String site = request.getHeader(FETCH_SITE);
        if (site == null || SAME_ORIGIN.equals(site) || USER_INITIATED.equals(site)) {
            return;
        }
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        if (origin != null && allowedOrigins.contains(origin)) {
            return;
        }
        log.warn("Refusing to rotate a refresh token for a {} request from origin {}: not an origin "
                + "this API serves. Either an allowed origin is missing from {}, or a page under our "
                + "own registrable domain is driving refreshes it should not be able to drive.",
                site, origin == null ? "<absent>" : origin, "draazy.web.cors.allowed-origins");
        throw new ForbiddenException("Refresh is not permitted from this origin");
    }
}
