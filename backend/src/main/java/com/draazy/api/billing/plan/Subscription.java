package com.draazy.api.billing.plan;

import com.draazy.api.common.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;

/** One user's subscription to a {@link Plan}; a pending row exists from checkout open, active only once paid. */
@Entity
@Table(name = "subscriptions")
@Getter
public class Subscription extends VersionedEntity {

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "plan_id", nullable = false, updatable = false)
    private UUID planId;

    /** The listing a listing pass covers; null for every other kind. */
    @Column(name = "property_id", updatable = false)
    private UUID propertyId;

    @Column(name = "status", nullable = false)
    private String status;

    /** Copied from the plan at purchase so a later repricing cannot restate what this purchase cost. */
    @Column(name = "amount", nullable = false, updatable = false)
    private long amount;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "renews_at")
    private Instant renewsAt;

    /** The gateway order id, the webhook's key; written after the insert so the row survives a gateway failure. */
    @Column(name = "payment_ref")
    private String paymentRef;

    /** The client's {@code Idempotency-Key}; released on every unpaid ending so a plan-derived key cannot replay it. */
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

    protected Subscription() {
        // JPA
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

    /** False, not an error, when the row is not pending: a provider may redeliver the webhook. */
    boolean activate(Instant paidAt, Instant renewal) {
        if (!SubscriptionStatuses.PENDING.equals(status)) {
            return false;
        }
        this.status = SubscriptionStatuses.ACTIVE;
        this.startedAt = paidAt;
        this.renewsAt = renewal;
        return true;
    }

    /** Never overwrites a ref: the displaced order would stay live at the gateway with no row to credit. */
    boolean attachOrder(String orderId) {
        if (!SubscriptionStatuses.PENDING.equals(status) || paymentRef != null) {
            return false;
        }
        this.paymentRef = orderId;
        return true;
    }

    /** The gateway refused the order, so no payment can follow; the key goes with the status. */
    boolean abandonUnopened() {
        if (!SubscriptionStatuses.PENDING.equals(status) || paymentRef != null) {
            return false;
        }
        this.status = SubscriptionStatuses.CANCELLED;
        this.idempotencyKey = null;
        return true;
    }

    /** The payment ref is no guard: closing the modal sends no webhook, so pending alone proves nothing was paid. */
    boolean abandonCheckout() {
        if (!SubscriptionStatuses.PENDING.equals(status)) {
            return false;
        }
        this.status = SubscriptionStatuses.CANCELLED;
        this.idempotencyKey = null;
        return true;
    }

    /** True the first time only, so the owner is told once however often the gateway repeats itself. */
    boolean markRefundDue(Instant now) {
        return markRefundDue(now, null);
    }

    /** {@code amount} is what to send back when the provider took a different sum than the order was for. */
    boolean markRefundDue(Instant now, Long amount) {
        if (refundDueAt != null) {
            return false;
        }
        this.refundDueAt = now;
        this.refundAmount = amount;
        return true;
    }

    long refundable() {
        return refundAmount != null ? refundAmount : amount;
    }

    void markRefunded(String gatewayRefund) {
        this.refundRef = gatewayRefund;
    }

    /** Derived from the id so a resend is the same refund; a failed one needs the next attempt's id. */
    String gatewayRefundId() {
        String base = "lp_" + getId().toString().replace("-", "");
        return refundAttempts == 0 ? base : base + "_" + refundAttempts;
    }

    /** The gateway reported the refund failed: the money is due again, under a fresh refund id. */
    void refundFailed() {
        this.refundRef = null;
        this.refundAttempts++;
    }

    /** A declined card is retried at once, so the key is released with the status. */
    boolean fail() {
        return abandonCheckout();
    }

    /** A null {@code renewsAt} never lapses: a pending order has no term yet. The boundary is inclusive. */
    boolean hasLapsed(Instant now) {
        return SubscriptionStatuses.ACTIVE.equals(status)
                && renewsAt != null
                && !renewsAt.isAfter(now);
    }

    /** Only active rows expire; a cancelled row already says why it ended. */
    boolean expire(Instant now) {
        if (!hasLapsed(now)) {
            return false;
        }
        this.status = SubscriptionStatuses.EXPIRED;
        return true;
    }
}
