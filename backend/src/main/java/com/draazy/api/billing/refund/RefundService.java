package com.draazy.api.billing.refund;

import com.draazy.api.billing.plan.Plan;
import com.draazy.api.billing.plan.PlanRepository;
import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.billing.referral.ReferralSignals;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.RefundNotEligibleException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** A customer asks for a refund: the facts are re-read, the order is frozen, and staff are told. */
@Service
public class RefundService {

    private static final int REASON_MAX = 500;

    private static final int KEY_MAX = 128;

    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final RefundRequestRepository requests;
    private final RefundAssessor assessor;
    private final RefundListings listings;
    private final RateLimitLock locks;
    private final AuditService audit;
    private final RefundStaffAlerts staffAlerts;
    private final ReferralSignals signals;

    public RefundService(SubscriptionRepository subscriptions, PlanRepository plans,
            RefundRequestRepository requests, RefundAssessor assessor, RefundListings listings,
            RateLimitLock locks, AuditService audit, RefundStaffAlerts staffAlerts, ReferralSignals signals) {
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.requests = requests;
        this.assessor = assessor;
        this.listings = listings;
        this.locks = locks;
        this.audit = audit;
        this.staffAlerts = staffAlerts;
        this.signals = signals;
    }

    /** Lock order: the listing row, then the order row, then the caller's contact-spend lock. */
    @Transactional
    public RefundRequest request(AuthPrincipal caller, UUID orderId, String reason, String idempotencyKey,
            String deviceHeader) {
        String key = requireKey(idempotencyKey);
        Optional<RefundRequest> replay = requests.findByUserIdAndIdempotencyKey(caller.userId(), key);
        if (replay.isPresent()) {
            return sameOrder(replay.get(), orderId);
        }
        Subscription order = subscriptions.findById(orderId)
                .filter(s -> s.getUserId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Payment"));
        listings.lock(order);
        locks.holdUntilCommit(RateLimitLock.Limit.CONTACT_REQUEST, caller.userId().toString());

        Optional<RefundRequest> existing = requests.findBySubscriptionId(orderId);
        if (existing.isPresent() && key.equals(existing.get().getIdempotencyKey())) {
            return existing.get();
        }
        Plan plan = plans.findById(order.getPlanId()).filter(p -> RefundAssessor.isPack(p) || RefundAssessor.isPass(p))
                .orElseThrow(() -> NotFoundException.of("Payment"));
        String device = signals.deviceIdHash(deviceHeader);
        Instant now = Instant.now();
        RefundVerdict verdict = assessor.forCustomer(order, plan, existing.isPresent(), device, now);
        if (!verdict.eligible()) {
            throw new RefundNotEligibleException(verdict.reason(), RefundReasons.explain(verdict.reason()));
        }
        RefundRequest filed = requests.save(new RefundRequest(caller.userId(), orderId, RefundAssessor.kindOf(plan),
                verdict.basis(), order.getAmount(), clean(reason), key, device, order.getPaymentInstrumentHash()));
        if (!order.freezeForRefund(now)) {
            throw new ConflictException("This order can no longer be frozen for a refund review.");
        }
        subscriptions.saveAndFlush(order);
        if (RefundAssessor.isPass(plan) && listings.pauseIfUncovered(order, now, "while your refund request is reviewed")) {
            filed.markListingPaused();
        }
        audit.record(caller, "refund.requested", "refund_request", filed.getId().toString(),
                "order", order.getPaymentRef(), "kind", filed.getKind(), "amount", filed.getAmount());
        staffAlerts.notifyHolders("refund.requested", "Refund request to review",
                Notifier.rupees(filed.getAmount()) + " " + plan.getName() + " refund requested (" + filed.getBasis() + ").");
        return filed;
    }

    private static RefundRequest sameOrder(RefundRequest replay, UUID orderId) {
        if (!replay.getSubscriptionId().equals(orderId)) {
            throw new ConflictException("That Idempotency-Key was already used for a different order.");
        }
        return replay;
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > KEY_MAX) {
            throw new ValidationException("An Idempotency-Key header of at most " + KEY_MAX + " characters is required");
        }
        return key.trim();
    }

    static String clean(String reason) {
        if (reason == null || reason.isBlank()) {
            return null;
        }
        return reason.strip().substring(0, Math.min(reason.strip().length(), REASON_MAX));
    }
}