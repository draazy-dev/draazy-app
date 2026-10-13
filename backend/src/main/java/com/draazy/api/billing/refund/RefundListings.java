package com.draazy.api.billing.refund;

import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.catalog.listing.ListingDuplicateProbe;
import com.draazy.api.catalog.listing.ListingQuota;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.Notifier;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import org.springframework.stereotype.Component;

/** What freezing a listing pass does to its listing, and undoing it. Callers hold the listing row lock. */
@Component
class RefundListings {

    private final PropertyRepository properties;
    private final ListingQuota quota;
    private final ListingDuplicateProbe duplicates;
    private final RateLimitLock locks;
    private final AuditService audit;
    private final Notifier notifier;
    private final EntityManager entityManager;

    RefundListings(PropertyRepository properties, ListingQuota quota, ListingDuplicateProbe duplicates,
            RateLimitLock locks, AuditService audit, Notifier notifier, EntityManager entityManager) {
        this.properties = properties;
        this.quota = quota;
        this.duplicates = duplicates;
        this.locks = locks;
        this.audit = audit;
        this.notifier = notifier;
        this.entityManager = entityManager;
    }

    /** The lock order every refund path shares: the listing row, then the order row. */
    void lock(Subscription order) {
        if (order.getPropertyId() != null) {
            properties.findForVerificationDecision(order.getPropertyId());
        }
        entityManager.refresh(order, LockModeType.PESSIMISTIC_WRITE);
    }

    /** Pauses the listing when the free tier cannot hold it once the pass stops covering it. */
    boolean pauseIfUncovered(Subscription pass, Instant now, String why) {
        return properties.findForVerificationDecision(pass.getPropertyId())
                .filter(p -> !p.isArchived() && PropertyStatus.APPROVED.equals(p.getStatus())
                        && !quota.mayGoLive(p, now))
                .map(p -> {
                    p.pauseByOwner();
                    audit.record("system", "admin", "property.refundReviewPause", "property", p.getId().toString());
                    notifier.notify(pass.getUserId(), "refund.review", "Your listing is paused",
                            p.getTitle() + " is paused " + why + ".", "/dashboard");
                    return true;
                }).orElse(false);
    }

    void resume(Subscription pass, String auditAction) {
        properties.findForVerificationDecision(pass.getPropertyId())
                .filter(p -> !p.isArchived() && PropertyStatus.PAUSED.equals(p.getStatus())
                        && quota.mayGoLive(p, Instant.now()))
                .ifPresent(p -> {
                    locks.holdUntilCommit(RateLimitLock.Limit.LISTING_LIVE, pass.getUserId().toString());
                    p.resumeByOwner();
                    audit.record("system", "admin", auditAction, "property", p.getId().toString());
                    duplicates.flag(p);
                });
    }
}