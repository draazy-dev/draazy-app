package com.draazy.api.identity.auth;

import com.draazy.api.security.JwtProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class RefreshCookie {
    private static final Logger log = LoggerFactory.getLogger(RefreshCookie.class);

    private static final String HOST_PREFIX = "__Host-";

    // Unprefixed half of the name; the cookie actually sent is name(), so never read a live
    // request with this constant.
    public static final String NAME = "draazy_rt";

    public static final String HINT_NAME = "draazy_session";

    private static final String HINT_REMEMBERED = "1";

    private static final String HINT_SESSION = "0";

    private static final Duration SESSION_ONLY = Duration.ofSeconds(-1);

    private final Duration ttl;
    private final boolean secure;
    private final String sameSite;

    RefreshCookie(JwtProperties jwt,
            @Value("${draazy.security.refresh-cookie.secure:true}") boolean secure,
            @Value("${draazy.security.refresh-cookie.same-site:Lax}") String sameSite) {
        this.ttl = jwt.refreshTtl();
        this.secure = secure;
        this.sameSite = sameSite;
    }

    public String name() {
        return secure ? HOST_PREFIX + NAME : NAME;
    }

    public String hintName() {
        return secure ? HOST_PREFIX + HINT_NAME : HINT_NAME;
    }

    // Read manually, not via @CookieValue: duplicate cookies signal another scope writing into
    // our jar, so refuse both rather than guess whose session. Log the name, never the value.
    public String presented(HttpServletRequest request) {
        Cookie[] jar = request.getCookies();
        if (jar == null) {
            return null;
        }
        String wanted = name();
        String found = null;
        for (Cookie c : jar) {
            if (wanted.equals(c.getName())) {
                if (found != null) {
                    log.warn("Refusing a refresh: the request carried more than one '{}' cookie, "
                            + "which means two scopes. Expect either a leftover from a cookie-name "
                            + "or path change, or another host writing into our jar.", wanted);
                    return null;
                }
                found = c.getValue();
            }
        }
        return found == null || found.isBlank() ? null : found;
    }

    public ResponseCookie issued(String rawToken, boolean remember) {
        return base(rawToken).maxAge(remember ? ttl : SESSION_ONLY).build();
    }

    public ResponseCookie issuedHint(boolean remember) {
        return hintBase(remember ? HINT_REMEMBERED : HINT_SESSION)
                .maxAge(remember ? ttl : SESSION_ONLY)
                .build();
    }

    public ResponseCookie cleared() {
        return base("").maxAge(Duration.ZERO).build();
    }

    public ResponseCookie clearedHint() {
        return hintBase("").maxAge(Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(name(), value)
                .httpOnly(true)
                .secure(secure)
                .sameSite(sameSite)
                .path("/");
    }

    private ResponseCookie.ResponseCookieBuilder hintBase(String value) {
        return ResponseCookie.from(hintName(), value)
                .httpOnly(false)
                .secure(secure)
                .sameSite(sameSite)
                .path("/");
    }
}
