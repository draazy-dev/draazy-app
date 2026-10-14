package com.draazy.api.billing.referral;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;

/** One redeemed referral and the signals its automatic decision used; see docs/flows/ops/referrals-fraud.md. */
@Entity
@Table(name = "referrals")
@Getter
public class Referral extends AuditedEntity {

    @Column(name = "referrer_id", updatable = false)
    private UUID referrerId;

    @Column(name = "referrer_mobile", updatable = false)
    private String referrerMobile;

    @Column(name = "referred", updatable = false)
    private String referred;

    @Column(name = "referred_mobile", updatable = false)
    private String referredMobile;

    @Column(name = "channel", updatable = false)
    private String channel;

    // How the link reached the referee; distinct from `channel`, the side of the marketplace they joined on.
    @Column(name = "share_channel", updatable = false)
    private String shareChannel;

    // Human label of what the referrer earns; written when the track is decided.
    @Column(name = "reward")
    private String reward;

    @Column(name = "reward_amount", nullable = false)
    private long rewardAmount;

    @Column(name = "status", nullable = false)
    private String status;

    // owner or seeker; the first qualifying event decides it, null until then.
    @Column(name = "track")
    private String track;

    @Column(name = "risk")
    private String risk;

    @Column(name = "hold_until")
    private Instant holdUntil;

    @Column(name = "auto_reason")
    private String autoReason;

    @Column(name = "identity_verified", nullable = false, updatable = false)
    private boolean identityVerified;

    @Column(name = "identity_unique", nullable = false, updatable = false)
    private boolean identityUnique;

    @Column(name = "same_device", nullable = false, updatable = false)
    private boolean sameDevice;

    @Column(name = "same_ip", nullable = false, updatable = false)
    private boolean sameIp;

    @Column(name = "velocity_high", nullable = false, updatable = false)
    private boolean velocityHigh;

    @Column(name = "activated", nullable = false)
    private boolean activated;

    @Column(name = "at", nullable = false, updatable = false)
    private Instant at;

    // When the qualifying event happened; null until it does.
    @Column(name = "qualified_at")
    private Instant qualifiedAt;

    // Evidence, not an association: no foreign key, so a withdrawn listing neither erases nor blocks it.
    @Column(name = "qualified_property_id")
    private UUID qualifiedPropertyId;

    // When it began earning; starts the clawback window.
    @Column(name = "granted_at")
    private Instant grantedAt;

    @Column(name = "referred_ip_hash")
    @Getter(AccessLevel.NONE)
    private String referredIpHash;

    @Column(name = "referred_device_hash")
    @Getter(AccessLevel.NONE)
    private String referredDeviceHash;

    @Column(name = "referred_device_id_hash")
    @Getter(AccessLevel.NONE)
    private String referredDeviceIdHash;

    @Column(name = "handled_by")
    private String handledBy;

    @Column(name = "handled_at")
    private Instant handledAt;

    @Column(name = "handled_reason")
    @Getter(AccessLevel.NONE)
    private String handledReason;

    protected Referral() {
        // JPA
    }

    Referral(UUID referrerId, String referrerMobile, String referred, String referredMobile,
            String channel, String shareChannel, String risk, boolean identityVerified,
            boolean velocityHigh, boolean sameDevice, boolean sameIp,
            ReferralSignals.Signals signals) {
        this.referrerId = referrerId;
        this.referrerMobile = referrerMobile;
        this.referred = referred;
        this.referredMobile = referredMobile;
        this.channel = channel;
        this.shareChannel = shareChannel;
        this.reward = "Decided by the first listing or contact";
        this.status = ReferralStatuses.PENDING;
        this.risk = risk;
        this.identityVerified = identityVerified;
        this.identityUnique = identityVerified;
        this.sameDevice = sameDevice;
        this.sameIp = sameIp;
        this.velocityHigh = velocityHigh;
        this.referredIpHash = signals.ipHash();
        this.referredDeviceHash = signals.deviceHash();
        this.referredDeviceIdHash = signals.deviceIdHash();
        this.at = Instant.now();
    }

    boolean isPending() {
        return ReferralStatuses.PENDING.equals(status);
    }

    /** Records the first qualifying event; the status is then settled by one of the {@code auto*} moves. */
    void qualifyOn(String track, UUID propertyId, Instant eventAt, String rewardLabel, long amount) {
        this.track = track;
        this.qualifiedAt = eventAt;
        this.qualifiedPropertyId = propertyId;
        this.reward = rewardLabel;
        this.rewardAmount = amount;
        this.activated = true;
    }

    void autoGrant(String sentence) {
        this.holdUntil = null;
        this.grantedAt = Instant.now();
        move(ReferralStatuses.QUALIFIED, ReferralStatuses.SYSTEM, null, sentence);
    }

    void autoHold(Instant until, String sentence) {
        this.holdUntil = until;
        move(ReferralStatuses.HELD, ReferralStatuses.SYSTEM, "medium_risk", sentence);
    }

    void autoReject(String reason, String sentence) {
        this.holdUntil = null;
        move(ReferralStatuses.REJECTED, ReferralStatuses.SYSTEM, reason, sentence);
    }

    void autoClawBack(String reason, String sentence) {
        move(ReferralStatuses.CLAWED_BACK, ReferralStatuses.SYSTEM, reason, sentence);
    }

    /** A staff override; the caller enforces the transition table so a refusal carries the right status. */
    void decide(String nextStatus, String handler, String reason) {
        this.holdUntil = null;
        if (ReferralStatuses.isGranting(nextStatus) && grantedAt == null) {
            this.grantedAt = Instant.now();
        }
        move(nextStatus, handler, null, reason);
    }

    private void move(String nextStatus, String handler, String autoReasonCode, String reason) {
        this.status = nextStatus;
        this.autoReason = autoReasonCode;
        this.handledBy = handler;
        this.handledAt = Instant.now();
        this.handledReason = reason;
    }
}
