package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

/** Keyed on the owner's mobile like {@link FlatmateOwnerConsent}: the landlord rarely has an account.
 * Only the hash of the link token is stored. */
@Entity
@Table(name = "flatmate_owner_notices")
@Getter
public class FlatmateOwnerNotice extends BaseEntity {

    static final String SENT = "sent";
    static final String AGREED = "agreed";
    static final String DECLINED = "declined";

    @Column(name = "room_id", nullable = false, updatable = false)
    private UUID roomId;

    @Column(name = "host_id", nullable = false, updatable = false)
    private UUID hostId;

    @Column(name = "owner_mobile", nullable = false, updatable = false)
    private String ownerMobile;

    @Column(name = "address_fingerprint", nullable = false, updatable = false)
    private String addressFingerprint;

    @Column(name = "token_hash", nullable = false, updatable = false)
    private String tokenHash;

    @Column(name = "status", nullable = false)
    private String status = SENT;

    @Column(name = "responded_at")
    private Instant respondedAt;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    protected FlatmateOwnerNotice() {
    }

    FlatmateOwnerNotice(UUID roomId, UUID hostId, String ownerMobile, String addressFingerprint,
            String tokenHash, Instant expiresAt) {
        this.roomId = roomId;
        this.hostId = hostId;
        this.ownerMobile = ownerMobile;
        this.addressFingerprint = addressFingerprint;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    boolean answered() {
        return !SENT.equals(status);
    }

    void answer(String outcome, Instant at) {
        this.status = outcome;
        this.respondedAt = at;
    }
}