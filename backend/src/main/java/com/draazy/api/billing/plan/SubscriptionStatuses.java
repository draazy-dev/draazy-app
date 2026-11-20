package com.draazy.api.billing.plan;

import java.util.Set;

public final class SubscriptionStatuses {
    private SubscriptionStatuses() {
    }

    public static final String PENDING = "pending";

    public static final String ACTIVE = "active";

    public static final String PAST_DUE = "past-due";

    public static final String CANCELLED = "cancelled";

    public static final String EXPIRED = "expired";

    public static final String REFUND_REVIEW = "refund-review";

    public static final String REFUNDED = "refunded";

    public static final String DISPUTED = "disputed";

    public static final Set<String> ENTITLED = Set.of(ACTIVE, PAST_DUE);

    private static final Set<String> LIVE = Set.of(PENDING, ACTIVE, PAST_DUE);

    public static boolean isEntitling(String status) {
        return ENTITLED.contains(status);
    }

    public static boolean isLive(String status) {
        return LIVE.contains(status);
    }
}
