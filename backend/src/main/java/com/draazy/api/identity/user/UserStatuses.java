package com.draazy.api.identity.user;

import java.util.Set;

public final class UserStatuses {
    public static final String ACTIVE = "active";

    public static final String SUSPENDED = "suspended";

    public static final String ARCHIVED = "archived";

    public static final Set<String> ALL = Set.of(ACTIVE, SUSPENDED, ARCHIVED);

    private UserStatuses() {
    }
}
