package com.draazy.api.engagement.review;

import java.util.Set;

public final class ReviewTargetTypes {
    private ReviewTargetTypes() {
    }

    public static final String PROPERTY = "property";

    public static final String LOCALITY = "locality";

    public static final String SOCIETY = "society";

    public static final String OWNER = "owner";

    public static final Set<String> ENTITY_TARGETS = Set.of(LOCALITY, SOCIETY, OWNER);

    public static boolean isEntityTarget(String value) {
        return value != null && ENTITY_TARGETS.contains(value);
    }
}
