package com.draazy.api.billing.plan;

import com.draazy.api.catalog.listing.ListingDuplicateProbe;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.web.Ids;
import com.draazy.api.provider.PaymentGateway;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** The listing-pass rules: what a pass may be bought for, and what activating one does to its listing. */
@Component
class ListingPasses {

    private static final Logger log = LoggerFactory.getLogger(ListingPasses.class);

    private static final int MAX_REFUNDS_PER_RUN = 50;

    private static final String REFUND_SUCCESS = "SUCCESS";

    private static final String EXPECTED_CURRENCY = "INR";

    private static final Set<String> REFUND_REFUSED = Set.of("CANCELLED", "FAILED");

    private static final Pattern REFUND_ID =
            Pattern.compile("lp_([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})(?:_\\d+)?");

    private static final Set<String> BUYABLE_STATUSES = Set.of(
            PropertyStatus.PENDING, PropertyStatus.APPROVED, PropertyStatus.PAUSED, PropertyStatus.FLAGGED);

    private final PropertyRepository properties;
    private final SubscriptionRepository subscriptions;
    private final ListingDuplicateProbe duplicates;
    private final AuditService audit;
    private final RateLimitLock locks;
    private final PaymentGateway gateway;
    private final Notifier notifier;
    private final TransactionTemplate transactions;
    private final EntityManager entityManager;

    ListingPasses(PropertyRepository properties, SubscriptionRepository subscriptions,
            ListingDuplicateProbe duplicates, AuditService audit, RateLimitLock locks,
            PaymentGateway gateway, Notifier notifier, PlatformTransactionManager transactionManager,
            EntityManager entityManager) {
        this.entityManager = entityManager;
        this.properties = properties;
        this.subscriptions = subscriptions;
        this.duplicates = duplicates;
        this.audit = audit;
        this.locks = locks;
        this.gateway = gateway;
        this.notifier = notifier;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    UUID requireBuyable(UUID ownerId, String propertyId) {
        UUID id = Ids.parseUuid(propertyId)
                .orElseThrow(() -> new ValidationException("propertyId is required for a listing pass"));
        Property property = properties.findByIdAndOwner_Id(id, ownerId)
                .orElseThrow(() -> NotFoundException.of("Listing"));
        if (property.isArchived() || !BUYABLE_STATUSES.contains(property.getStatus())) {
            throw new ConflictException("A listing pass can only be bought for a pending, live or paused listing.");
        }
        if (properties.hasActivePass(id, Instant.now())) {
            throw new ConflictException("This listing already has an active listing pass.");
        }
        return id;
    }

    /** Locks the listing row, then re-reads the pass under lock, so a terminal transition that ended it is seen
     * and a webhook cannot act on a stale copy. */
    void lock(Subscription pass) {
        properties.findForVerificationDecision(pass.getPropertyId());
        entityManager.refresh(pass, LockModeType.PESSIMISTIC_WRITE);
    }

    /** A paused listing is the one the owner bought the pass to bring back. */
    void resumeIfPaused(Subscription pass) {
        properties.findForVerificationDecision(pass.getPropertyId())
                .filter(p -> !p.isArchived() && PropertyStatus.PAUSED.equals(p.getStatus()))
                .ifPresent(p -> {
                    locks.holdUntilCommit(RateLimitLock.Limit.LISTING_LIVE, pass.getUserId().toString());
                    p.resumeByOwner();
                    audit.record(pass.getUserId(), "owner", "property.ownerResume", "property",
                            p.getId().toString());
                    duplicates.flag(p);
                });
    }

    /** Money arrived for an order that cannot buy anything: it was cancelled, or its listing is off the market. */
    boolean isDead(Subscription pass) {
        if (SubscriptionStatuses.CANCELLED.equals(pass.getStatus())) {
            return true;
        }
        return SubscriptionStatuses.PENDING.equals(pass.getStatus())
                && properties.findById(pass.getPropertyId())
                        .map(p -> p.isArchived() || PropertyStatus.RENTED.equals(p.getStatus())
                                || PropertyStatus.SOLD.equals(p.getStatus()))
                        .orElse(true);
    }

    /** Records the refund as due and tells the owner. The gateway call is {@link #sendDueRefunds}'s, so no
     * HTTP happens inside the webhook's transaction. */
    void refund(Subscription pass, Instant now) {
        pass.abandonCheckout();
        if (pass.markRefundDue(now)) {
            audit.record("system", "admin", "subscription.passRefundDue", "subscription",
                    pass.getId().toString(), null,
                    "{\"amount\":" + pass.getAmount() + ",\"order\":\"" + pass.getPaymentRef() + "\"}");
            notifier.notify(pass.getUserId(), "subscription.refund",
                    Notifier.rupees(pass.getAmount()) + " will be refunded",
                    "That listing is no longer live, so the pass was not activated and your payment goes back"
                            + " to the account you paid from.", "/dashboard");
        }
    }

    /** A signed paid callback whose sum or currency is not the order's grants nothing; the sum paid goes back. */
    boolean refundIfMismatched(Subscription order, Instant now, BigDecimal paid, String currency) {
        boolean wrongCurrency = currency != null && !currency.isBlank()
                && !EXPECTED_CURRENCY.equalsIgnoreCase(currency);
        boolean wrongAmount = paid != null && paid.compareTo(BigDecimal.valueOf(order.getAmount())) != 0;
        if (!wrongCurrency && !wrongAmount) {
            return false;
        }
        order.abandonCheckout();
        long back = paid == null ? order.getAmount() : paid.setScale(0, RoundingMode.DOWN).longValue();
        if (order.markRefundDue(now, back)) {
            audit.record("system", "admin", "subscription.amountMismatch", "subscription",
                    order.getId().toString(), Map.of("expected", order.getAmount(), "paid", String.valueOf(paid),
                            "currency", String.valueOf(currency), "order", order.getPaymentRef()));
            log.warn("Order {} (subscription {}) was billed {} {} but the provider reports {} {}; nothing was"
                    + " granted and the payment is due back.", order.getPaymentRef(), order.getId(),
                    order.getAmount(), EXPECTED_CURRENCY, paid, currency);
            notifier.notify(order.getUserId(), "subscription.refund", Notifier.rupees(back) + " will be refunded",
                    "The payment did not match the price of what you ordered, so nothing was activated and your"
                            + " payment goes back to the account you paid from.", "/dashboard");
        }
        return true;
    }

    /** One gateway call and one short transaction per row, so a refused refund leaves the others untouched. */
    int sendDueRefunds() {
        int sent = 0;
        for (Subscription due : subscriptions
                .findByRefundDueAtIsNotNullAndRefundRefIsNullOrderByRefundDueAtAsc(Limit.of(MAX_REFUNDS_PER_RUN))) {
            if (settle(due)) {
                sent++;
            }
        }
        return sent;
    }

    // The refund id derives from the subscription id, so a resend after a failed record is the same refund.
    private boolean settle(Subscription due) {
        String refundId = due.gatewayRefundId();
        String ref = send(due, refundId);
        if (ref == null) {
            return false;
        }
        try {
            transactions.executeWithoutResult(status -> markRefunded(due.getId(), refundId, ref));
            return true;
        } catch (RuntimeException unrecorded) {
            log.error("Refund {} of {} on order {} (subscription {}) reached the gateway but could not be"
                    + " recorded; the next run finds it there and records it.", ref, due.refundable(),
                    due.getPaymentRef(), due.getId(), unrecorded);
            return false;
        }
    }

    // A refusal may mean the refund already exists (an earlier run sent it but could not record it).
    private String send(Subscription due, String refundId) {
        try {
            return gateway.refund(due.getPaymentRef(), due.refundable(), refundId, "Order not activated");
        } catch (RuntimeException refused) {
            try {
                Optional<String> existing = gateway.findRefund(due.getPaymentRef(), refundId);
                if (existing.isPresent()) {
                    log.warn("Refund {} on order {} already exists at the gateway as {}; recording it.",
                            refundId, due.getPaymentRef(), existing.get());
                    return existing.get();
                }
            } catch (RuntimeException lookupFailed) {
                refused.addSuppressed(lookupFailed);
            }
            log.error("Refund of {} on order {} (subscription {}) was refused; it stays due and will be retried.",
                    due.refundable(), due.getPaymentRef(), due.getId(), refused);
            return null;
        }
    }

    private void markRefunded(UUID subscriptionId, String refundId, String ref) {
        subscriptions.findById(subscriptionId)
                .filter(p -> p.getRefundRef() == null && refundId.equals(p.gatewayRefundId()))
                .ifPresent(p -> recordRefunded(p, ref));
    }

    private void recordRefunded(Subscription pass, String ref) {
        pass.markRefunded(ref);
        audit.record("system", "admin", "subscription.passRefunded", "subscription",
                pass.getId().toString(), null,
                "{\"amount\":" + pass.refundable() + ",\"gatewayRefund\":\"" + ref + "\"}");
    }

    /** The gateway's refund status for one of our {@code lp_} refunds; false when the id is not one of ours. */
    boolean applyRefundWebhook(String refundId, String status, String gatewayRef) {
        Matcher m = refundId == null ? null : REFUND_ID.matcher(refundId);
        if (m == null || !m.matches()) {
            return false;
        }
        UUID id = UUID.fromString(m.group(1) + "-" + m.group(2) + "-" + m.group(3) + "-" + m.group(4) + "-"
                + m.group(5));
        Optional<Subscription> found = subscriptions.findById(id);
        if (found.isEmpty()) {
            return false;
        }
        Subscription pass = found.get();
        if (!refundId.equals(pass.gatewayRefundId())) {
            return true;
        }
        if (REFUND_SUCCESS.equals(status) && pass.getRefundRef() == null) {
            recordRefunded(pass, gatewayRef == null || gatewayRef.isBlank() ? refundId : gatewayRef);
        } else if (REFUND_REFUSED.contains(status) && pass.getRefundDueAt() != null) {
            pass.refundFailed();
            audit.record("system", "admin", "subscription.passRefundFailed", "subscription",
                    pass.getId().toString(), null, "{\"status\":\"" + status + "\",\"refundId\":\"" + refundId + "\"}");
            log.error("Gateway {} refund {} of {} on order {}; it is due again under a new refund id.",
                    status, refundId, pass.refundable(), pass.getPaymentRef());
        }
        return true;
    }
}
