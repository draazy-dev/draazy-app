package com.draazy.api.finance.rental;

import java.util.Set;

public final class RentalStatuses {
    private RentalStatuses() {
    }

    public static final String ACTIVE = "active";

    public static final String ENDED = "ended";

    private static final Set<String> ALL = Set.of(ACTIVE, ENDED);

    public static boolean isValid(String value) {
        return value != null && ALL.contains(value);
    }
}
