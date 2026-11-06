package com.draazy.api.services.support;

public final class SupportTicketStatuses {
    private SupportTicketStatuses() {
    }

    public static final String OPEN = "open";

    public static final String IN_PROGRESS = "in-progress";

    public static final String WAITING = "waiting";

    public static final String RESOLVED = "resolved";

    public static final String CLOSED = "closed";

    public static final String IDENTITY_DISPUTE = "identity_dispute";

    public static final String IDENTITY_APPEAL = "identity_appeal";

    public static boolean isIdentity(String category) {
        return IDENTITY_DISPUTE.equals(category) || IDENTITY_APPEAL.equals(category);
    }
}
