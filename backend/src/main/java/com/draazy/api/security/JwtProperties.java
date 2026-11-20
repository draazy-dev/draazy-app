package com.draazy.api.security;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "draazy.security.jwt")
public record JwtProperties(
        String secret,
        @DefaultValue("15m") Duration accessTtl,
        @DefaultValue("30d") Duration refreshTtl,
        @DefaultValue("15s") Duration refreshGrace) {
    private static final Duration MAX_GRACE = Duration.ofMinutes(1);

    public JwtProperties {
        if (accessTtl == null || accessTtl.isNegative() || accessTtl.isZero()) {
            throw new IllegalArgumentException(
                    "draazy.security.jwt.access-ttl must be positive, was " + accessTtl);
        }
        if (refreshTtl == null || refreshTtl.isNegative() || refreshTtl.isZero()) {
            throw new IllegalArgumentException(
                    "draazy.security.jwt.refresh-ttl must be positive, was " + refreshTtl);
        }
        if (refreshTtl.compareTo(accessTtl) < 0) {
            throw new IllegalArgumentException(
                    "draazy.security.jwt.refresh-ttl (" + refreshTtl + ") must not be shorter "
                            + "than access-ttl (" + accessTtl + "): a refresh token that dies first "
                            + "leaves nothing to rotate");
        }
        if (refreshGrace == null || refreshGrace.isNegative()) {
            throw new IllegalArgumentException(
                    "draazy.security.jwt.refresh-grace must not be negative, was " + refreshGrace);
        }
        if (refreshGrace.compareTo(MAX_GRACE) > 0) {
            throw new IllegalArgumentException(
                    "draazy.security.jwt.refresh-grace (" + refreshGrace + ") exceeds the "
                            + MAX_GRACE + " ceiling: a window this wide forgives every replay and "
                            + "turns reuse-detection off without appearing to");
        }
    }
}
