package com.draazy.api.services.ticket;

import java.util.Set;

public final class TicketStatuses {
    private TicketStatuses() {
    }

    public static final String OPEN = "open";
    public static final String IN_PROGRESS = "in-progress";
    public static final String WAITING = "waiting";
    public static final String RESOLVED = "resolved";
    public static final String CLOSED = "closed";

    private static final Set<String> ALL = Set.of(OPEN, IN_PROGRESS, WAITING, RESOLVED, CLOSED);

    public static final Set<String> UNRESOLVED = Set.of(OPEN, IN_PROGRESS, WAITING);

    public static boolean isKnown(String status) {
        return ALL.contains(status);
    }
}
