package com.draazy.api.billing.refund;

import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.billing.plan.SubscriptionStatuses;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.trust.Notifier;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Gateway disputes: one freezes only its own order, and closing it restores that order (won) or ends it. */
@Service
public class PaymentDisputes {

    private static final Logger log = LoggerFactory.getLogger(PaymentDisputes.class);

    private static final String AUDIT_ENTITY = "payment_dispute";

    private static final String CLOSED_EVENT = "DISPUTE_CLOSED";

    public record Event(String type, String disputeRef, String orderRef, String providerStatus, Long amount, String reason) {
    }

    private final PaymentDisputeRepository disputes;
    private final SubscriptionRepository subscriptions;
    private final RefundRequestRepository requests;
    private final RefundListings listings;
    private final RefundStaffAlerts staffAlerts;
    private final AuditService audit;
    private final Notifier notifier;

    public PaymentDisputes(PaymentDisputeRepository disputes, SubscriptionRepository subscriptions,
            RefundRequestRepository requests, RefundListings listings, RefundStaffAlerts staffAlerts,
            AuditService audit, Notifier notifier) {
        this.disputes = disputes;
        this.subscriptions = subscriptions;
        this.requests = requests;
        this.listings = listings;
        this.staffAlerts = staffAlerts;
        this.audit = audit;
        this.notifier = notifier;
    }

    /** Any dispute event: the first one seen for a dispute opens it, a terminal status closes it. */
    @Transactional
    public void apply(Event event) {
        if (event.disputeRef() == null || event.orderRef() == null) {
            log.warn("Dispute event without a dispute or order id ignored");
            return;
        }
        Optional<Subscription> order = subscriptions.findByPaymentRef(event.orderRef());
        order.ifPresent(listings::lock);
        PaymentDispute dispute = disputes.findByDisputeRef(event.disputeRef())
                .orElseGet(() -> open(event, order));
        dispute.update(event.providerStatus());
        String outcome = outcomeOf(event.providerStatus());
        if (outcome != null && dispute.close(outcome, Instant.now())) {
            close(dispute, order);
        } else if (outcome == null && CLOSED_EVENT.equals(event.type())) {
            log.warn("Dispute {} closed with status {} this server does not know; the order stays frozen",
                    event.disputeRef(), event.providerStatus());
        }
    }

    private PaymentDispute open(Event event, Optional<Subscription> order) {
        PaymentDispute dispute = new PaymentDispute(event.disputeRef(), event.orderRef(),
                order.map(Subscription::getUserId).orElse(null), order.map(Subscription::getId).orElse(null),
                event.amount(), event.reason(), event.providerStatus(), Instant.now());
        String frozen = order.map(o -> o.freezeForDispute(Instant.now())).orElse(null);
        boolean paused = false;
        if (frozen != null) {
            subscriptions.saveAndFlush(order.get());
            paused = order.get().getPropertyId() != null
                    && listings.pauseIfUncovered(order.get(), Instant.now(), "while the bank reviews a dispute on your payment");
        }
        dispute.recordFreeze(frozen, paused);
        disputes.save(dispute);
        audit.record("system", "admin", "refund.dispute_opened", AUDIT_ENTITY, event.disputeRef(), null,
                "{\"order\":\"" + event.orderRef() + "\",\"frozen\":" + (frozen != null) + "}");
        staffAlerts.notifyHolders("refund.dispute", "Payment dispute opened",
                "Order " + event.orderRef() + (event.amount() == null ? "" : " (" + Notifier.rupees(event.amount()) + ")")
                        + " is disputed" + (event.reason() == null ? "" : ": " + event.reason()) + ".");
        return dispute;
    }

    private void close(PaymentDispute dispute, Optional<Subscription> order) {
        boolean won = PaymentDispute.WON.equals(dispute.getStatus());
        if (order.isPresent()) {
            Subscription held = order.get();
            if (won) {
                if (held.restoreAfterDisputeWon(dispute.getFrozenFrom(), Instant.now())) {
                    subscriptions.saveAndFlush(held);
                    if (dispute.isListingPaused() && SubscriptionStatuses.isEntitling(held.getStatus())) {
                        listings.resume(held, "property.disputeWonResume");
                    }
                }
            } else if (held.revokeAfterDisputeLost()) {
                subscriptions.saveAndFlush(held);
                rejectPendingRequest(held);
                if (held.getPropertyId() != null) {
                    listings.pauseIfUncovered(held, Instant.now(), "after the bank ruled on the disputed payment");
                }
            }
        }
        audit.record("system", "admin", "refund.dispute_closed", AUDIT_ENTITY, dispute.getDisputeRef(), null,
                "{\"outcome\":\"" + dispute.getStatus() + "\"}");
    }

    // The bank has taken the money back, so a refund request for it would pay the customer twice.
    private void rejectPendingRequest(Subscription order) {
        requests.findBySubscriptionId(order.getId()).filter(RefundRequest::isPending).ifPresent(request -> {
            request.reject(null, Instant.now(), "The payment was charged back by the bank.");
            notifier.notify(request.getUserId(), "refund.decided", "Your refund request was closed",
                    "The payment was charged back by your bank, so there is nothing left to refund.", "/dashboard");
        });
    }

    /** Null for a status that is not terminal, so an unknown value leaves the order frozen rather than guessing. */
    static String outcomeOf(String providerStatus) {
        if (providerStatus == null) {
            return null;
        }
        String status = providerStatus.toUpperCase(Locale.ROOT);
        if (status.contains("ACCEPTED")) {
            return PaymentDispute.ACCEPTED;
        }
        if (status.contains("MERCHANT_WON")) {
            return PaymentDispute.WON;
        }
        if (status.contains("LOST") || status.contains("INSUFFICIENT_EVIDENCE")) {
            return PaymentDispute.LOST;
        }
        return null;
    }
}