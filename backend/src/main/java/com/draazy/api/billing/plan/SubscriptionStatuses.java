package com.draazy.api.billing.plan;

import java.util.Set;

/** The {@code Subscription.status} vocabulary: constants, not an enum, because they are database and wire values. */
public final class SubscriptionStatuses {

    private SubscriptionStatuses() {
    }

    /** Checkout opened, money not yet confirmed. Carries no plan benefits. */
    public static final String PENDING = "pending";

    /** Paid and within its term. */
    public static final String ACTIVE = "active";

    /** Renewal failed; benefits retained for a grace window. Declared but never produced: every plan is a one-off. */
    public static final String PAST_DUE = "past-due";

    /** Ended early — abandoned at checkout or refused by the gateway. */
    public static final String CANCELLED = "cancelled";

    /** Term elapsed without renewal. Written by the sweep; also decided live on every read. */
    public static final String EXPIRED = "expired";

    /** Paid, but a refund request is waiting for staff: entitles nothing until it is decided. */
    public static final String REFUND_REVIEW = "refund-review";

    /** A staff-approved refund was issued; the benefit is gone for good. */
    public static final String REFUNDED = "refunded";

    /** The card network is disputing the payment: entitles nothing until the dispute closes. */
    public static final String DISPUTED = "disputed";

    /** The states that actually entitle a user to the plan's benefits. */
    public static final Set<String> ENTITLED = Set.of(ACTIVE, PAST_DUE);

    /** The states in which a subscription is still the user's, entitling or not. */
    private static final Set<String> LIVE = Set.of(PENDING, ACTIVE, PAST_DUE);

    /** Pending does not entitle: no money has moved. */
    public static boolean isEntitling(String status) {
        return ENTITLED.contains(status);
    }

    /** Pending counts as held so a user can resume an order they already created; it still does not entitle. */
    public static boolean isLive(String status) {
        return LIVE.contains(status);
    }
}
