package com.draazy.api.billing.plan;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class TestPlanGrants {
    public static final UUID OWNER_PLUS = UUID.fromString("b1000000-0000-4000-8000-000000000002");

    public static final UUID LISTING_PASS = UUID.fromString("b1000000-0000-4000-8000-000000000005");

    public static final UUID CONTACT_PACK = UUID.fromString("b1000000-0000-4000-8000-000000000006");

    public static final UUID BUY_CONTACT_PACK = UUID.fromString("b1000000-0000-4000-8000-000000000007");

    @Autowired SubscriptionRepository subscriptions;

    @Autowired PlanRepository plans;

    public void grant(UUID userId, UUID planId) {
        save(userId, planId, null, Instant.now(), Instant.now().plus(30, ChronoUnit.DAYS));
    }

    public Subscription grantPass(UUID userId, UUID propertyId, Instant renewsAt) {
        return save(userId, LISTING_PASS, propertyId, Instant.now(), renewsAt);
    }

    public Subscription grantPack(UUID userId, Instant from, Instant renewsAt) {
        return save(userId, CONTACT_PACK, null, from, renewsAt);
    }

    public Subscription grantBuyPack(UUID userId, Instant from, Instant renewsAt) {
        return save(userId, BUY_CONTACT_PACK, null, from, renewsAt);
    }

    private Subscription save(UUID userId, UUID planId, UUID propertyId, Instant from, Instant renewsAt) {
        long price = plans.findById(planId).orElseThrow().getPrice();
        return subscriptions.saveAndFlush(new Subscription(userId, planId, propertyId,
                SubscriptionStatuses.ACTIVE, price, from, renewsAt, null, null));
    }
}
