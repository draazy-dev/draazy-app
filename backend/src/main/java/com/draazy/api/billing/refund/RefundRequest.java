package com.draazy.api.billing.refund;

import com.draazy.api.common.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

/** A customer's request to have one paid order refunded; staff decide it exactly once. */
@Entity
@Table(name = "refund_requests")
@Getter
public class RefundRequest extends VersionedEntity {

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "subscription_id", nullable = false, updatable = false)
    private UUID subscriptionId;

    @Column(name = "kind", nullable = false, updatable = false)
    private String kind;

    @Column(name = "status", nullable = false)
    private String status = RefundStatuses.PENDING_REVIEW;

    @Column(name = "basis", nullable = false, updatable = false)
    private String basis;

    @Column(name = "amount", nullable = false, updatable = false)
    private long amount;

    @Column(name = "customer_reason", updatable = false)
    private String customerReason;

    @Column(name = "idempotency_key", nullable = false, updatable = false)
    private String idempotencyKey;

    @Column(name = "device_id_hash", updatable = false)
    private String deviceIdHash;

    @Column(name = "instrument_hash", updatable = false)
    private String instrumentHash;

    @Column(name = "listing_paused", nullable = false)
    private boolean listingPaused;

    @Column(name = "decided_by")
    private UUID decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decision_reason")
    private String decisionReason;

    protected RefundRequest() {
        // JPA
    }

    RefundRequest(UUID userId, UUID subscriptionId, String kind, String basis, long amount,
            String customerReason, String idempotencyKey, String deviceIdHash, String instrumentHash) {
        this.userId = userId;
        this.subscriptionId = subscriptionId;
        this.kind = kind;
        this.basis = basis;
        this.amount = amount;
        this.customerReason = customerReason;
        this.idempotencyKey = idempotencyKey;
        this.deviceIdHash = deviceIdHash;
        this.instrumentHash = instrumentHash;
    }

    void markListingPaused() {
        this.listingPaused = true;
    }

    public boolean isPending() {
        return RefundStatuses.PENDING_REVIEW.equals(status);
    }

    boolean approve(UUID by, Instant now) {
        return decide(RefundStatuses.APPROVED, by, now, null);
    }

    boolean reject(UUID by, Instant now, String reason) {
        return decide(RefundStatuses.REJECTED, by, now, reason);
    }

    private boolean decide(String outcome, UUID by, Instant now, String reason) {
        if (!isPending()) {
            return false;
        }
        this.status = outcome;
        this.decidedBy = by;
        this.decidedAt = now;
        this.decisionReason = reason;
        return true;
    }
}