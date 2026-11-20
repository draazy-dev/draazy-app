package com.draazy.api.deals.deal;

public final class DealStatuses {
    private DealStatuses() {
    }

    public static final String ACTIVE = "active";

    public static final String RESERVED = "reserved";

    public static final String CLOSED = "closed";

    public static boolean canTransition(String current, String next) {
        if (ACTIVE.equals(current)) {
            return RESERVED.equals(next) || CLOSED.equals(next);
        }
        if (RESERVED.equals(current)) {
            return CLOSED.equals(next) || ACTIVE.equals(next);
        }
        if (CLOSED.equals(current)) {
            return ACTIVE.equals(next);
        }
        return false;
    }
}
