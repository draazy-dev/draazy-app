package com.draazy.api.identity.auth;

import com.draazy.api.common.error.UnauthorizedException;
import com.draazy.api.security.JwtProperties;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefreshTokenService {
    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);

    private static final int MAX_GRACE_HOPS = 3;

    static final int MAX_CONSECUTIVE_GRACES = 3;

    private final RefreshTokenRepository repository;
    private final Duration ttl;
    private final Duration grace;

    public RefreshTokenService(RefreshTokenRepository repository, JwtProperties jwtProperties) {
        this.repository = repository;
        this.ttl = jwtProperties.refreshTtl();
        this.grace = jwtProperties.refreshGrace();
    }

    @Transactional
    public String issue(UUID userId) {
        String raw = Tokens.randomToken();
        repository.save(new RefreshToken(userId, Tokens.sha256Hex(raw), null,
                Instant.now().plus(ttl)));
        return raw;
    }

    // noRollbackFor: the reuse path revokes the family and then throws; a rollback would undo the burn.
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public Rotation rotate(String rawToken) {
        String hash = Tokens.sha256Hex(rawToken);
        UUID owner = repository.findUserIdByTokenHash(hash)
                .orElseThrow(() -> new UnauthorizedException("Invalid refresh token"));
        repository.lockFamily(familyKey(owner));

        RefreshToken current = repository.findByTokenHash(hash)
                .orElseThrow(() -> new UnauthorizedException("Invalid refresh token"));

        if (current.isRevoked()) {
            RefreshToken heir = liveHeirWithinGrace(current, Instant.now());
            if (heir != null && heir.getGracedCount() < MAX_CONSECUTIVE_GRACES) {
                log.warn("Refresh replay forgiven inside the {} grace window for user {} "
                        + "(consecutive grace {} of {}) -- served from the family's live head "
                        + "instead of revoking the family",
                        grace, current.getUserId(), heir.getGracedCount() + 1,
                        MAX_CONSECUTIVE_GRACES);
                return mintSuccessor(heir, heir.getGracedCount() + 1);
            }
            if (heir != null) {
                log.warn("Refresh replay NOT forgiven for user {}: {} consecutive graces on one "
                        + "chain exceeds the limit of {} -- revoking the family",
                        current.getUserId(), heir.getGracedCount(), MAX_CONSECUTIVE_GRACES);
            }
            revokeAllForUser(current.getUserId());
            throw new UnauthorizedException("Invalid refresh token");
        }
        if (current.isExpired()) {
            throw new UnauthorizedException("Invalid refresh token");
        }

        return mintSuccessor(current, 0);
    }

    private RefreshToken liveHeirWithinGrace(RefreshToken spent, Instant now) {
        Instant floor = now.minus(grace);
        RefreshToken link = spent;
        for (int hop = 0; hop < MAX_GRACE_HOPS; hop++) {
            RefreshToken heir = repository.findByRotatedFrom(link.getId()).orElse(null);
            if (heir == null || heir.getCreatedAt().isBefore(floor)) {
                return null;
            }
            if (!heir.isRevoked()) {
                return heir.isExpired() ? null : heir;
            }
            link = heir;
        }
        return null;
    }

    private Rotation mintSuccessor(RefreshToken current, int gracedCount) {
        current.revoke();
        String raw = Tokens.randomToken();
        repository.save(new RefreshToken(current.getUserId(), Tokens.sha256Hex(raw),
                current.getId(), Instant.now().plus(ttl), gracedCount));
        return new Rotation(current.getUserId(), raw);
    }

    // Call before dirtying the users row: the family lock must come first everywhere, or this
    // deadlocks against a burn.
    @Transactional
    public void revokeAllForUser(UUID userId) {
        repository.lockFamily(familyKey(userId));
        repository.findByUserId(userId).forEach(RefreshToken::revoke);
        repository.stampSessionsRevoked(userId, Instant.now().truncatedTo(ChronoUnit.SECONDS));
    }

    private static long familyKey(UUID userId) {
        return userId.getMostSignificantBits() ^ userId.getLeastSignificantBits();
    }

    @Transactional
    public long pruneExpired(Instant now) {
        return repository.deleteExpiredBefore(now);
    }

    public record Rotation(UUID userId, String refreshToken) {
    }
}
