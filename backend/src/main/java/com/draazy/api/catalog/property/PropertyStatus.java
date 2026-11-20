package com.draazy.api.catalog.property;

import java.util.List;
import java.util.Set;

public final class PropertyStatus {
    private PropertyStatus() {
    }

    public static final String PENDING = "pending";

    public static final String APPROVED = "approved";

    public static final String PAUSED = "paused";

    public static final String REJECTED = "rejected";

    public static final String FLAGGED = "flagged";

    public static final String ARCHIVED = "archived";

    public static final String SOLD = "sold";

    public static final String RENTED = "rented";

    public static final Set<String> DIRECTLY_REACHABLE = Set.of(APPROVED, PAUSED, SOLD, RENTED);

    public static final List<String> OCCUPYING_DUPLICATE_STATUSES = List.of(PENDING, APPROVED, PAUSED);

    public static final Set<String> OCCUPIES_LISTING_SLOT = Set.of(APPROVED, FLAGGED);
}
