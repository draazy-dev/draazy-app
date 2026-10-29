package com.draazy.api.billing.plan;

import com.draazy.api.common.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;

@Entity
@Table(name = "subscriptions")
@Getter
public class Subscription extends VersionedEntity {
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "plan_id", nullable = false, updatable = false)
    private UUID planId;

    @Column(name = "property_id", updatable = false)
    private UUID propertyId;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "amount", nullable = false, updatable = false)
    private long amount;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "renews_at")
    private Instant renewsAt;

    @Column(name = "payment_ref")
    private String paymentRef;

    @Column(name = "idempotency_key")
    @Getter(AccessLevel.NONE)
    private String idempotencyKey;

    @Column(name = "refund_due_at")
    private Instant refundDueAt;

    @Column(name = "refund_ref")
    private String refundRef;

    @Column(name = "refund_attempts", nullable = false)
    private int refundAttempts;

    @Column(name = "refund_amount")
    private Long refundAmount;

    // Read-only here so an entity flush can never overwrite what markRefundTried wrote.
    @Column(name = "refund_tried_at", insertable = false, updatable = false)
    private Instant refundTriedAt;

    @Column(name = "refund_reason")
    private String refundReason;

    @Column(name = "refund_settled_at")
    private Instant refundSettledAt;

    @Column(name = "frozen_at")
    private Instant frozenAt;

    @Column(name = "payment_instrument_hash")
    private String paymentInstrumentHash;

    protected Subscription() {
    }

    Subscription(UUID userId, UUID planId, UUID propertyId, String status, long amount,
            Instant startedAt, Instant renewsAt, String paymentRef, String idempotencyKey) {
        this.userId = userId;
        this.planId = planId;
        this.propertyId = propertyId;
        this.status = status;
        this.amount = amount;
        this.startedAt = startedAt;
        this.renewsAt = renewsAt;
        this.paymentRef = paymentRef;
        this.idempotencyKey = idempotencyKey;
    }

    boolean activate(Instant paidAt, Instant renewal) {
        if (!SubscriptionStatuses.PENDING.equals(status)) {
            return false;
        }
        this.status = SubscriptionStatuses.ACTIVE;
        this.startedAt = paidAt;
        this.renewsAt = renewal;
        return true;
    }

    boolean attachOrder(String orderId) {
        if (!SubscriptionStatuses.PENDING.equals(status) || paymentRef != null) {
            return false;
        }
        this.paymentRef = orderId;
        return true;
    }

    boolean abandonUnopened() {
        if (!SubscriptionStatuses.PENDING.equals(status) || paymentRef != null) {
            return false;
        }
        this.status = SubscriptionStatuses.CANCELLED;
        this.idempotencyKey = null;
        return true;
    }

    boolean abandonCheckout() {
        if (!SubscriptionStatuses.PENDING.equals(status)) {
            return false;
        }
        this.status = SubscriptionStatuses.CANCELLED;
        this.idempotencyKey = null;
        return true;
    }

    boolean markRefundDue(Instant now, Long amount, String reason) {
        if (refundDueAt != null) {
            return false;
        }
        this.refundDueAt = now;
        this.refundAmount = amount;
        this.refundReason = reason;
        return true;
    }

    long refundable() {
        return refundAmount != null ? refundAmount : amount;
    }

    void markRefunded(String gatewayRefund) {
        this.refundRef = gatewayRefund;
    }

    void refundSettled(Instant now) {
        if (refundSettledAt == null) {
            this.refundSettledAt = now;
        }
    }

    String gatewayRefundId() {
        String base = "lp_" + getId().toString().replace("-", "");
        return refundAttempts == 0 ? base : base + "_" + refundAttempts;
    }

    void refundFailed() {
        this.refundRef = null;
        this.refundAttempts++;
    }

    boolean hasLapsed(Instant now) {
        return SubscriptionStatuses.ACTIVE.equals(status)
                && renewsAt != null
                && !renewsAt.isAfter(now);
    }

    public void recordInstrument(String hash) {
        if (hash != null && paymentInstrumentHash == null) {
            this.paymentInstrumentHash = hash;
        }
    }

    public boolean freezeForRefund(Instant now) {
        if (!moveStatus(SubscriptionStatuses.ACTIVE, SubscriptionStatuses.REFUND_REVIEW)) {
            return false;
        }
        this.frozenAt = now;
        return true;
    }

    public boolean restoreAfterRefundRejected(Instant now) {
        return moveStatus(SubscriptionStatuses.REFUND_REVIEW, SubscriptionStatuses.ACTIVE) && thaw(now);
    }

    public boolean approveRefund(Instant now, long refundAmount) {
        if (!moveStatus(SubscriptionStatuses.REFUND_REVIEW, SubscriptionStatuses.REFUNDED)) {
            return false;
        }
        markRefundDue(now, refundAmount, RefundReasons.CUSTOMER_REQUEST);
        return true;
    }

    public String freezeForDispute(Instant now) {
        String before = status;
        if (!SubscriptionStatuses.isEntitling(before) || !moveStatus(before, SubscriptionStatuses.DISPUTED)) {
            return null;
        }
        this.frozenAt = now;
        return before;
    }

    public boolean restoreAfterDisputeWon(String frozenFrom, Instant now) {
        return frozenFrom != null && moveStatus(SubscriptionStatuses.DISPUTED, frozenFrom) && thaw(now);
    }

    public boolean recordOutsideRefund(String gatewayRefund, long refunded, Instant now) {
        if (refundRef != null) {
            return false;
        }
        if (refundDueAt == null) {
            this.refundDueAt = now;
            this.refundReason = RefundReasons.GATEWAY_DASHBOARD;
        }
        this.refundAmount = refunded;
        this.refundRef = gatewayRefund;
        this.refundSettledAt = now;
        boolean held = SubscriptionStatuses.isEntitling(status) || SubscriptionStatuses.DISPUTED.equals(status)
                || SubscriptionStatuses.REFUND_REVIEW.equals(status);
        if (refunded >= amount && held) {
            this.status = SubscriptionStatuses.REFUNDED;
            this.frozenAt = null;
        }
        return true;
    }

    public boolean revokeAfterDisputeLost() {
        boolean held = SubscriptionStatuses.isEntitling(status) || SubscriptionStatuses.DISPUTED.equals(status)
                || SubscriptionStatuses.REFUND_REVIEW.equals(status);
        if (!held) {
            return false;
        }
        this.status = SubscriptionStatuses.CANCELLED;
        this.frozenAt = null;
        return true;
    }

    private boolean thaw(Instant now) {
        if (frozenAt != null && renewsAt != null && now.isAfter(frozenAt)) {
            this.renewsAt = renewsAt.plus(Duration.between(frozenAt, now));
        }
        this.frozenAt = null;
        expire(now);
        return true;
    }

    private boolean moveStatus(String from, String to) {
        if (!from.equals(status)) {
            return false;
        }
        this.status = to;
        return true;
    }

    boolean expire(Instant now) {
        if (!hasLapsed(now)) {
            return false;
        }
        this.status = SubscriptionStatuses.EXPIRED;
        return true;
    }
}
