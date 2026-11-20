package com.draazy.api.leads.contact;

public final class ContactRequestStatuses {
    private ContactRequestStatuses() {
    }

    public static final String PENDING = "pending";

    public static final String APPROVED = "approved";

    public static final String DECLINED = "declined";

    public static final String EXPIRED = "expired";

    public static final String WITHDRAWN = "withdrawn";

    public static final String RESPONSE_PATTERN = "^(" + APPROVED + "|" + DECLINED + ")$";

    public static boolean canTransition(String current, String next) {
        return PENDING.equals(current) && (APPROVED.equals(next) || DECLINED.equals(next));
    }
}
