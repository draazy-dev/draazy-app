package com.draazy.api.deals.offer;

public final class OfferStatuses {
    private OfferStatuses() {
    }

    public static final String PENDING = "pending";

    public static final String COUNTERED = "countered";

    public static final String ACCEPTED = "accepted";

    public static final String DECLINED = "declined";

    public static final String WITHDRAWN = "withdrawn";

    public static final String BY_BUYER = "buyer";
    public static final String BY_OWNER = "owner";

    public static boolean canTransition(String current, String next) {
        if (PENDING.equals(current) || COUNTERED.equals(current)) {
            return COUNTERED.equals(next)
                    || ACCEPTED.equals(next)
                    || DECLINED.equals(next)
                    || WITHDRAWN.equals(next);
        }
        return false;
    }
}
