package com.draazy.api.billing.refund;

import com.draazy.api.billing.credit.CreditNotes;
import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.billing.plan.SubscriptionStatuses;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.trust.Notifier;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** A pack or pass refunded on the gateway dashboard rather than through the refunds desk. */
@Service
public class ExternalRefunds {

    private static final Logger log = LoggerFactory.getLogger(ExternalRefunds.class);

    private final SubscriptionRepository subscriptions;
    private final RefundRequestRepository requests;
    private final RefundListings listings;
    private final RefundStaffAlerts staffAlerts;
    private final CreditNotes creditNotes;
    private final AuditService audit;
    private final Notifier notifier;

    public ExternalRefunds(SubscriptionRepository subscriptions, RefundRequestRepository requests,
            RefundListings listings, RefundStaffAlerts staffAlerts, CreditNotes creditNotes, AuditService audit,
            Notifier notifier) {
        this.subscriptions = subscriptions;
        this.requests = requests;
        this.listings = listings;
        this.staffAlerts = staffAlerts;
        this.creditNotes = creditNotes;
        this.audit = audit;
        this.notifier = notifier;
    }

    /** False when the order is not a pack or pass of ours. A redelivered webhook changes nothing. */
    @Transactional
    public boolean apply(String orderRef, String gatewayRefund, long amount) {
        Optional<Subscription> found = orderRef == null ? Optional.empty() : subscriptions.findByPaymentRef(orderRef);
        if (found.isEmpty()) {
            return false;
        }
        Subscription order = found.get();
        listings.lock(order);
        if (gatewayRefund == null || gatewayRefund.equals(order.getRefundRef())) {
            return true;
        }
        Instant now = Instant.now();
        String before = order.getStatus();
        if (!order.recordOutsideRefund(gatewayRefund, amount, now)) {
            log.error("Order {} was refunded {} on the gateway as {}, but refund {} was already on record; the"
                    + " customer may have been paid twice.", orderRef, amount, gatewayRefund, order.getRefundRef());
            staffAlerts.notifyHolders("refund.auto", "Second refund on one order",
                    "Order " + orderRef + " was refunded again on the payment gateway (" + Notifier.rupees(amount)
                            + "). Check whether the customer was paid twice.");
            return true;
        }
        subscriptions.saveAndFlush(order);
        boolean ended = SubscriptionStatuses.REFUNDED.equals(order.getStatus()) && !before.equals(order.getStatus());
        if (ended) {
            closePendingRequest(order, now);
            if (order.getPropertyId() != null) {
                listings.pauseIfUncovered(order, now, "because its listing pass was refunded");
            }
        }
        creditNotes.issue(order.getUserId(), CreditNotes.SUBSCRIPTION, order.getId(), orderRef, amount, now);
        audit.record("system", "admin", "subscription.refundedOutside", "subscription", order.getId().toString(),
                Map.of("order", orderRef, "amount", amount, "gatewayRefund", gatewayRefund, "ended", ended));
        notifier.notify(order.getUserId(), "refund.completed", Notifier.rupees(amount) + " refunded",
                (ended ? "Your purchase has ended and the" : "The") + " money is on its way to the account you paid"
                        + " from. Banks usually take 5\u20137 working days.", "/dashboard");
        staffAlerts.notifyHolders("refund.auto", "Refund made on the payment gateway",
                Notifier.rupees(amount) + " went back on order " + orderRef + " from the gateway dashboard"
                        + (ended ? "; the purchase has ended." : "; part of the price, so the purchase stays live."));
        return true;
    }

    // The money is already back, so approving the request later would refund it twice.
    private void closePendingRequest(Subscription order, Instant now) {
        requests.findBySubscriptionId(order.getId()).filter(RefundRequest::isPending)
                .ifPresent(request -> request.approve(null, now));
    }
}
