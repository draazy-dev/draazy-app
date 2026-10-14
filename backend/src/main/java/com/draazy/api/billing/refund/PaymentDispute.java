package com.draazy.api.billing.refund;

import com.draazy.api.common.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

/** A chargeback the gateway reported against one order. */
@Entity
@Table(name = "payment_disputes")
@Getter
public class PaymentDispute extends VersionedEntity {

    public static final String OPEN = "open";
    public static final String WON = "won";
    public static final String LOST = "lost";
    public static final String ACCEPTED = "accepted";

    @Column(name = "dispute_ref", nullable = false, updatable = false)
    private String disputeRef;

    @Column(name = "order_ref", nullable = false, updatable = false)
    private String orderRef;

    @Column(name = "user_id", updatable = false)
    private UUID userId;

    @Column(name = "subscription_id", updatable = false)
    private UUID subscriptionId;

    @Column(name = "status", nullable = false)
    private String status = OPEN;

    @Column(name = "provider_status")
    private String providerStatus;

    @Column(name = "amount")
    private Long amount;

    @Column(name = "reason")
    private String reason;

    @Column(name = "frozen_from")
    private String frozenFrom;

    @Column(name = "listing_paused", nullable = false)
    private boolean listingPaused;

    @Column(name = "opened_at", nullable = false, updatable = false)
    private Instant openedAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    protected PaymentDispute() {
        // JPA
    }

    PaymentDispute(String disputeRef, String orderRef, UUID userId, UUID subscriptionId, Long amount, String reason,
            String providerStatus, Instant openedAt) {
        this.disputeRef = disputeRef;
        this.orderRef = orderRef;
        this.userId = userId;
        this.subscriptionId = subscriptionId;
        this.amount = amount;
        this.reason = reason;
        this.providerStatus = providerStatus;
        this.openedAt = openedAt;
    }

    public boolean isOpen() {
        return OPEN.equals(status);
    }

    void recordFreeze(String frozenStatus, boolean paused) {
        this.frozenFrom = frozenStatus;
        this.listingPaused = paused;
    }

    void update(String providerStatus) {
        if (providerStatus != null) {
            this.providerStatus = providerStatus;
        }
    }

    boolean close(String outcome, Instant now) {
        if (!isOpen()) {
            return false;
        }
        this.status = outcome;
        this.closedAt = now;
        return true;
    }
}