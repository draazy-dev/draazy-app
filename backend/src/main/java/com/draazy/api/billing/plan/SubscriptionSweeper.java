package com.draazy.api.billing.plan;

import com.draazy.api.catalog.listing.ListingQuota;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.payments.AbandonedCheckouts;
import com.draazy.api.common.trust.Notifier;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** Ends lapsed terms and abandoned checkouts; neither sweep is the entitlement rule, which is judged on read. */
@Service
public class SubscriptionSweeper implements AbandonedCheckouts {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionSweeper.class);

    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final PropertyRepository properties;
    private final ListingQuota quota;
    private final ListingPasses passes;
    private final Notifier notifier;
    private final AuditService audit;
    private final TransactionTemplate transactions;

    public SubscriptionSweeper(SubscriptionRepository subscriptions, PlanRepository plans,
            PropertyRepository properties, ListingQuota quota, ListingPasses passes, Notifier notifier,
            AuditService audit, PlatformTransactionManager transactionManager) {
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.properties = properties;
        this.quota = quota;
        this.passes = passes;
        this.notifier = notifier;
        this.audit = audit;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    /** Pauses what the free tier has no room for, then expires the lapsed terms. Each pause is its own
     * transaction, listing row before the owner's LISTING_LIVE lock like the go-live paths. */
    public int expireLapsed(Instant now) {
        List<Subscription> lapsed = subscriptions
                .findByStatusAndRenewsAtLessThanEqual(SubscriptionStatuses.ACTIVE, now);
        Map<UUID, String> kinds = plans
                .findAllById(lapsed.stream().map(Subscription::getPlanId).distinct().toList()).stream()
                .collect(Collectors.toMap(Plan::getId, Plan::getKind));
        List<UUID> expirable = new ArrayList<>();
        Map<UUID, List<UUID>> planLapses = new LinkedHashMap<>();
        for (Subscription subscription : lapsed) {
            if (subscription.getPropertyId() != null) {
                if (attempt(subscription.getUserId(), () -> pauseIfOverFreeTier(subscription.getPropertyId(), now))) {
                    expirable.add(subscription.getId());
                }
            } else if (Plan.KIND_PLAN.equals(kinds.get(subscription.getPlanId()))) {
                planLapses.computeIfAbsent(subscription.getUserId(), owner -> new ArrayList<>())
                        .add(subscription.getId());
            } else {
                expirable.add(subscription.getId());
            }
        }
        planLapses.forEach((ownerId, ids) -> {
            if (attempt(ownerId, () -> pauseBeyondAllowance(ownerId, now))) {
                expirable.addAll(ids);
            }
        });
        return expire(expirable, now);
    }

    private boolean attempt(UUID ownerId, Runnable enforcement) {
        try {
            enforcement.run();
            return true;
        } catch (RuntimeException failed) {
            log.error("Could not re-apply the free tier for owner {}; their lapsed terms stay active and"
                    + " the next sweep retries.", ownerId, failed);
            return false;
        }
    }

    private int expire(List<UUID> ids, Instant now) {
        Integer ended = transactions.execute(status -> {
            int count = 0;
            for (Subscription subscription : subscriptions.findAllById(ids)) {
                if (subscription.expire(now)) {
                    count++;
                    log.info("Subscription {} expired: term ended {}",
                            subscription.getId(), subscription.getRenewsAt());
                }
            }
            return count;
        });
        return ended == null ? 0 : ended;
    }

    /** Sends the refunds recorded as due, one gateway call and one short transaction per row. */
    public int sendDueRefunds() {
        return passes.sendDueRefunds();
    }

    private void pauseIfOverFreeTier(UUID propertyId, Instant now) {
        transactions.executeWithoutResult(status -> properties.findForVerificationDecision(propertyId)
                .filter(p -> !p.isArchived() && PropertyStatus.APPROVED.equals(p.getStatus())
                        && !quota.mayGoLive(p, now))
                .ifPresent(p -> pause(p, "property.passLapsedPause", "listing.pass_ended",
                        "Your listing pass for " + p.getTitle() + " ended, so the listing is paused."
                        + " Buy a new pass or pause another listing to bring it back.")));
    }

    private void pauseBeyondAllowance(UUID ownerId, Instant now) {
        List<UUID> beyond = transactions.execute(status -> quota.liveBeyondAllowance(ownerId, now));
        for (UUID id : beyond == null ? List.<UUID>of() : beyond) {
            transactions.executeWithoutResult(status -> properties.findForVerificationDecision(id)
                    .filter(p -> !p.isArchived() && PropertyStatus.APPROVED.equals(p.getStatus())
                            && quota.liveBeyondAllowance(ownerId, now).contains(id))
                    .ifPresent(p -> pause(p, "property.planLapsedPause", "listing.plan_ended",
                            "Your plan ended, so " + p.getTitle() + " is paused: the free tier keeps one"
                            + " listing live. Buy a listing pass or pause another listing to bring it back.")));
        }
    }

    private void pause(Property p, String action, String type, String message) {
        p.pauseByOwner();
        audit.record("system", "admin", action, "property", p.getId().toString());
        notifier.notify(p.getOwner().getId(), type, "Your listing is paused", message, "/dashboard");
    }

    /** {@inheritDoc} — "subscription", so a sweep log line names the table that moved. */
    @Override
    public String family() {
        return "subscription";
    }

    /** Cancel checkouts opened before {@code cutoff} and never paid; the pending status is the proof. */
    @Override
    @Transactional
    public int expireAbandonedCheckouts(Instant cutoff) {
        List<Subscription> stale = subscriptions
                .findByStatusAndCreatedAtBeforeOrderByCreatedAtAsc(
                        SubscriptionStatuses.PENDING, cutoff, Limit.of(MAX_PER_SWEEP));
        int expired = 0;
        for (Subscription subscription : stale) {
            if (subscription.abandonCheckout()) {
                expired++;
                log.info("Subscription {} cancelled: its checkout was opened at {} and never paid",
                        subscription.getId(), subscription.getCreatedAt());
            }
        }
        return expired;
    }
}
