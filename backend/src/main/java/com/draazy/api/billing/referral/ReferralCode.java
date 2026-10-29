package com.draazy.api.billing.referral;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "referral_codes")
@Getter
public class ReferralCode {
    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "code", nullable = false, updatable = false)
    private String code;

    @Column(name = "referrer_ip_hash")
    private String referrerIpHash;

    @Column(name = "referrer_device_hash")
    private String referrerDeviceHash;

    @Column(name = "referrer_device_id_hash")
    private String referrerDeviceIdHash;

    @Column(name = "signals_at")
    private Instant signalsAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    @Getter(AccessLevel.NONE)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    @Getter(AccessLevel.NONE)
    private Instant updatedAt;

    protected ReferralCode() {
    }

    ReferralCode(UUID userId, String code, ReferralSignals.Signals signals) {
        this.userId = userId;
        this.code = code;
        refresh(signals);
    }

    void refresh(ReferralSignals.Signals signals) {
        if (signals.equals(ReferralSignals.Signals.NONE)) {
            return;
        }
        this.referrerIpHash = signals.ipHash() != null ? signals.ipHash() : referrerIpHash;
        this.referrerDeviceHash = signals.deviceHash() != null ? signals.deviceHash() : referrerDeviceHash;
        this.referrerDeviceIdHash = signals.deviceIdHash() != null ? signals.deviceIdHash() : referrerDeviceIdHash;
        this.signalsAt = Instant.now();
    }
}
