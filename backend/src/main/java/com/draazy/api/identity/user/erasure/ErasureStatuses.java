package com.draazy.api.identity.user.erasure;

import java.util.Set;

public final class ErasureStatuses {
    private ErasureStatuses() {
    }

    public static final String PENDING = "pending";

    public static final String COMPLETED = "completed";

    public static final String REJECTED = "rejected";

    private static final Set<String> TERMINAL = Set.of(COMPLETED, REJECTED);

    public static boolean isValid(String value) {
        return PENDING.equals(value) || TERMINAL.contains(value);
    }

    public static boolean isDecidable(String from) {
        return PENDING.equals(from);
    }
}
