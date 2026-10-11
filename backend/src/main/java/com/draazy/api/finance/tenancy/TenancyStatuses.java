package com.draazy.api.finance.tenancy;

/** String constants matching the V109 CHECK on {@code tenancies.status}; terminal states are never reopened. */
public final class TenancyStatuses {

    private TenancyStatuses() {
    }

    /** Proposed by the owner on a rent deal close, not yet confirmed by the named tenant. Proves nothing. */
    public static final String PENDING = "pending";

    /** The tenant is in occupation. At most one per property — enforced by V10's unique index. */
    public static final String ACTIVE = "active";

    /** Ran its course: the agreement expired or both sides parted on schedule. Terminal. */
    public static final String ENDED = "ended";

    /** Cut short: notice, default or dispute. Terminal, and materially different from {@link #ENDED}. */
    public static final String TERMINATED = "terminated";

    /** Never became active: the tenant refused it, or the owner reopened the deal first. Terminal. */
    public static final String DECLINED = "declined";

    /** Whether {@code value} is one of the five stored statuses. */
    public static boolean isValid(String value) {
        return PENDING.equals(value) || ACTIVE.equals(value) || ENDED.equals(value)
                || TERMINATED.equals(value) || DECLINED.equals(value);
    }

    /** Whether the tenancy is over, in either sense. */
    public static boolean isTerminal(String value) {
        return ENDED.equals(value) || TERMINATED.equals(value);
    }

    // Legal moves: pending to active or declined, active to ended or terminated.
    public static boolean canTransition(String current, String next) {
        if (PENDING.equals(current)) {
            return ACTIVE.equals(next) || DECLINED.equals(next);
        }
        return ACTIVE.equals(current) && isTerminal(next);
    }
}
