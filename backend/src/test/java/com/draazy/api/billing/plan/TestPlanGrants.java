package com.draazy.api.billing.plan;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Grants a live plan, pass or pack to a test user; {@link Subscription}'s constructor is package-private. */
@Component
public class TestPlanGrants {

    /** A retired plan, still honoured for whoever bought it: {@code listing_limit = 2}, unlimited contacts. */
    public static final UUID OWNER_PLUS = UUID.fromString("b1000000-0000-4000-8000-000000000002");

    public static final UUID LISTING_PASS = UUID.fromString("b1000000-0000-4000-8000-000000000005");

    public static final UUID CONTACT_PACK = UUID.fromString("b1000000-0000-4000-8000-000000000006");

    @Autowired SubscriptionRepository subscriptions;

    @Autowired PlanRepository plans;

    /** Put {@code userId} on {@code planId}, active for the next thirty days. */
    public void grant(UUID userId, UUID planId) {
        save(userId, planId, null, Instant.now(), Instant.now().plus(30, ChronoUnit.DAYS));
    }

    /** A listing pass on {@code propertyId} that lapses at {@code renewsAt}. */
    public Subscription grantPass(UUID userId, UUID propertyId, Instant renewsAt) {
        return save(userId, LISTING_PASS, propertyId, Instant.now(), renewsAt);
    }

    /** A contact pack activated at {@code from} that lapses at {@code renewsAt}. */
    public Subscription grantPack(UUID userId, Instant from, Instant renewsAt) {
        return save(userId, CONTACT_PACK, null, from, renewsAt);
    }

    private Subscription save(UUID userId, UUID planId, UUID propertyId, Instant from, Instant renewsAt) {
        long price = plans.findById(planId).orElseThrow().getPrice();
        return subscriptions.saveAndFlush(new Subscription(userId, planId, propertyId,
                SubscriptionStatuses.ACTIVE, price, from, renewsAt, null, null));
    }
}
