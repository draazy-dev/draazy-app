package com.draazy.api.finance.tenancy;

public final class TenancyStatuses {
    private TenancyStatuses() {
    }

    public static final String PENDING = "pending";

    public static final String ACTIVE = "active";

    public static final String ENDED = "ended";

    public static final String TERMINATED = "terminated";

    public static final String DECLINED = "declined";

    public static boolean isValid(String value) {
        return PENDING.equals(value) || ACTIVE.equals(value) || ENDED.equals(value)
                || TERMINATED.equals(value) || DECLINED.equals(value);
    }

    public static boolean isTerminal(String value) {
        return ENDED.equals(value) || TERMINATED.equals(value);
    }

    public static boolean canTransition(String current, String next) {
        if (PENDING.equals(current)) {
            return ACTIVE.equals(next) || DECLINED.equals(next);
        }
        return ACTIVE.equals(current) && isTerminal(next);
    }
}
