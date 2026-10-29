package com.draazy.api.identity.auth;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

// Stored hashed; rotatedFrom chains rotations so a replayed token revokes its whole family.
// ponytail: raw UUIDs, not associations, because the table is only read by its own hash or id.
@Entity
@Table(name = "refresh_tokens")
@Getter
public class RefreshToken extends BaseEntity {
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "token_hash", nullable = false, unique = true, updatable = false)
    private String tokenHash;

    @Column(name = "rotated_from", updatable = false)
    private UUID rotatedFrom;

    @Column(name = "revoked", nullable = false)
    private boolean revoked = false;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "graced_count", nullable = false, updatable = false)
    private int gracedCount = 0;

    protected RefreshToken() {
    }

    public RefreshToken(UUID userId, String tokenHash, UUID rotatedFrom, Instant expiresAt) {
        this(userId, tokenHash, rotatedFrom, expiresAt, 0);
    }

    public RefreshToken(UUID userId, String tokenHash, UUID rotatedFrom, Instant expiresAt,
            int gracedCount) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.rotatedFrom = rotatedFrom;
        this.expiresAt = expiresAt;
        this.gracedCount = gracedCount;
    }

    public void revoke() {
        this.revoked = true;
    }

    public boolean isExpired() {
        return Instant.now().isAfter(expiresAt);
    }
}
