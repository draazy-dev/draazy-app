package com.draazy.api.deals.visit;

public final class VisitStatuses {
    private VisitStatuses() {
    }

    public static final String SCHEDULED = "scheduled";

    public static final String CONFIRMED = "confirmed";

    public static final String COMPLETED = "completed";

    public static final String CANCELLED = "cancelled";

    public static final String NO_SHOW = "no-show";

    public static boolean canTransition(String current, String next) {
        if (SCHEDULED.equals(current)) {
            return CONFIRMED.equals(next) || CANCELLED.equals(next);
        }
        if (CONFIRMED.equals(current)) {
            return COMPLETED.equals(next) || CANCELLED.equals(next) || NO_SHOW.equals(next);
        }
        return false;
    }

    public static boolean canReschedule(String current) {
        return SCHEDULED.equals(current) || CONFIRMED.equals(current);
    }
}
