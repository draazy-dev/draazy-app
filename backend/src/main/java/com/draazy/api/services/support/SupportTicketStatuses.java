package com.draazy.api.services.support;

/** The values {@code support_tickets.status} may hold; staff close a ticket via {@code POST .../close}. */
public final class SupportTicketStatuses {

    private SupportTicketStatuses() {
    }

    /** The only state a ticket is created in. */
    public static final String OPEN = "open";

    public static final String IN_PROGRESS = "in-progress";

    public static final String WAITING = "waiting";

    public static final String RESOLVED = "resolved";

    public static final String CLOSED = "closed";
}
