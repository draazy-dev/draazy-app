package com.draazy.api.moderation.report;

import java.util.Set;

public final class ReportStatuses {
    private ReportStatuses() {
    }

    public static final String OPEN = "open";

    public static final String REVIEWING = "reviewing";

    public static final String ACTIONED = "actioned";

    public static final String DISMISSED = "dismissed";

    public static final Set<String> LIVE = Set.of(OPEN, REVIEWING);

    private static final Set<String> TERMINAL = Set.of(ACTIONED, DISMISSED);

    public static boolean isValid(String value) {
        return OPEN.equals(value) || REVIEWING.equals(value)
                || ACTIONED.equals(value) || DISMISSED.equals(value);
    }

    public static boolean canTransition(String from, String to) {
        if (!isValid(from) || !isValid(to)) {
            return false;
        }
        return !TERMINAL.contains(from) || from.equals(to);
    }
}
