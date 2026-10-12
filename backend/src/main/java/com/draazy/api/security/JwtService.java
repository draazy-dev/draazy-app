package com.draazy.api.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

/** Stateless HS256 access tokens, 15 minutes (ADR-008); long sessions ride on rotating refresh tokens. */
@Service
public class JwtService {

    private final SecretKey key;
    private final Duration accessTtl;

    public JwtService(JwtProperties props) {
        // why: HS256 needs a ≥256-bit key; a short/absent secret must fail fast at boot, not per-request.
        this.key = Keys.hmacShaKeyFor(props.secret().getBytes(StandardCharsets.UTF_8));
        this.accessTtl = props.accessTtl();
    }

    /** Mint an access token for a freshly authenticated user. */
    public String issueAccessToken(TokenSubject user) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(user.getId().toString())
                .claim("role", user.getRole())
                .claim("mobileVerified", user.isMobileVerified())
                .claim("verified", user.isVerified())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(accessTtl)))
                .signWith(key);
        if (user.getTeam() != null) {
            builder.claim("team", user.getTeam());
        }
        return builder.compact();
    }

    /** Throws on an invalid, expired or tampered token, which the auth filter treats as unauthenticated. */
    public AuthPrincipal parse(String token) {
        return verify(token).principal();
    }

    /** {@link #parse} plus the token's issue time, which session revocation compares against. */
    public Verified verify(String token) {
        Claims c = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        return new Verified(new AuthPrincipal(
                UUID.fromString(c.getSubject()),
                c.get("role", String.class),
                c.get("team", String.class),
                Boolean.TRUE.equals(c.get("mobileVerified", Boolean.class)),
                Boolean.TRUE.equals(c.get("verified", Boolean.class))),
                c.getIssuedAt() == null ? Instant.EPOCH : c.getIssuedAt().toInstant());
    }

    public record Verified(AuthPrincipal principal, Instant issuedAt) {
    }

    public Duration accessTtl() {
        return accessTtl;
    }
}
