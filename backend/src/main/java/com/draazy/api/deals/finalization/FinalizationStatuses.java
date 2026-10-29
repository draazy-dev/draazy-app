package com.draazy.api.deals.finalization;

public final class FinalizationStatuses {
    private FinalizationStatuses() {
    }

    public static final String PENDING = "pending";

    public static final String ACCEPTED = "accepted";

    public static final String DECLINED = "declined";

    public static final String CANCELLED = "cancelled";

    public static boolean canTransition(String current, String next) {
        if (PENDING.equals(current)) {
            return ACCEPTED.equals(next) || DECLINED.equals(next) || CANCELLED.equals(next);
        }
        return false;
    }
}
