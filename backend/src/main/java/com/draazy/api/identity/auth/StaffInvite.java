package com.draazy.api.identity.auth;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "staff_invites")
@Getter
public class StaffInvite extends BaseEntity {
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "token_hash", nullable = false, updatable = false)
    private String tokenHash;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "redeemed_at")
    private Instant redeemedAt;

    protected StaffInvite() {
    }

    public StaffInvite(UUID userId, String tokenHash, UUID createdBy, Instant expiresAt) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.createdBy = createdBy;
        this.expiresAt = expiresAt;
    }

    public boolean isRedeemed() {
        return redeemedAt != null;
    }

    public boolean isExpired(Instant now) {
        return !now.isBefore(expiresAt);
    }

    public void redeem() {
        if (redeemedAt != null) {
            throw new IllegalStateException("invite already redeemed: " + getId());
        }
        this.redeemedAt = Instant.now();
    }
}
