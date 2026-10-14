package com.draazy.api.billing.refund;

import com.draazy.api.billing.plan.Plan;
import com.draazy.api.billing.plan.PlanRepository;
import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.billing.plan.SubscriptionStatuses;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.RefundNotEligibleException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Staff decide a refund request once. Lock order: the request row, the listing row, the order row. */
@Service
public class RefundDecisions {

    private final RefundRequestRepository requests;
    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final PaymentDisputeRepository disputes;
    private final RefundAssessor assessor;
    private final RefundListings listings;
    private final AuditService audit;
    private final Notifier notifier;

    public RefundDecisions(RefundRequestRepository requests, SubscriptionRepository subscriptions,
            PlanRepository plans, PaymentDisputeRepository disputes, RefundAssessor assessor,
            RefundListings listings, AuditService audit, Notifier notifier) {
        this.requests = requests;
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.disputes = disputes;
        this.assessor = assessor;
        this.listings = listings;
        this.audit = audit;
        this.notifier = notifier;
    }

    @Transactional
    public RefundRequest approve(AuthPrincipal staff, UUID requestId) {
        RefundRequest request = pending(requestId);
        Subscription order = lockOrder(request);
        requireNoOpenDispute(order);
        Plan plan = plans.findById(order.getPlanId()).orElseThrow(() -> NotFoundException.of("Plan"));
        RefundVerdict verdict = assessor.forDecision(order, plan, request);
        if (!verdict.eligible()) {
            throw new RefundNotEligibleException(verdict.reason(), RefundReasons.explain(verdict.reason()));
        }
        Instant now = Instant.now();
        if (!order.approveRefund(now, request.getAmount()) || !request.approve(staff.userId(), now)) {
            throw new ConflictException("This refund request can no longer be approved.");
        }
        audit.record(staff, "refund.approved", "refund_request", request.getId().toString(),
                "order", order.getPaymentRef(), "amount", request.getAmount());
        notifier.notify(request.getUserId(), "refund.decided", "Your refund was approved",
                Notifier.rupees(request.getAmount()) + " will be refunded to the account you paid from.", "/dashboard");
        return request;
    }

    @Transactional
    public RefundRequest reject(AuthPrincipal staff, UUID requestId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new ValidationException("A reason is required to reject a refund request");
        }
        String why = RefundService.clean(reason);
        RefundRequest request = pending(requestId);
        Subscription order = lockOrder(request);
        requireNoOpenDispute(order);
        Instant now = Instant.now();
        if (!request.reject(staff.userId(), now, why)) {
            throw new ConflictException("This refund request was already decided.");
        }
        if (order.restoreAfterRefundRejected(now)) {
            subscriptions.saveAndFlush(order);
            if (request.isListingPaused() && SubscriptionStatuses.isEntitling(order.getStatus())) {
                listings.resume(order, "property.refundRejectedResume");
            }
        }
        audit.record(staff, "refund.rejected", "refund_request", request.getId().toString(),
                "order", order.getPaymentRef(), "reason", why);
        notifier.notify(request.getUserId(), "refund.decided", "Your refund request was declined", why, "/dashboard");
        return request;
    }

    private void requireNoOpenDispute(Subscription order) {
        if (disputes.existsBySubscriptionIdAndStatus(order.getId(), PaymentDispute.OPEN)) {
            throw new ConflictException("The gateway is disputing this payment; decide after the dispute closes.");
        }
    }

    private RefundRequest pending(UUID requestId) {
        RefundRequest request = requests.findForDecision(requestId)
                .orElseThrow(() -> NotFoundException.of("Refund request"));
        if (!request.isPending()) {
            throw new ConflictException("This refund request was already decided.");
        }
        return request;
    }

    private Subscription lockOrder(RefundRequest request) {
        Subscription order = subscriptions.findById(request.getSubscriptionId())
                .orElseThrow(() -> NotFoundException.of("Payment"));
        listings.lock(order);
        return order;
    }
}