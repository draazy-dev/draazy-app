package com.draazy.api.engagement.review;

import com.draazy.api.common.trust.ReviewerStanding;

public final class ReviewContexts {
    private ReviewContexts() {
    }

    public static final String VISIT = "visit";

    public static final String TENANT = "tenant";

    // A null result means not eligible to review at all, never eligible without a badge.
    public static String fromStanding(ReviewerStanding standing) {
        return switch (standing) {
            case TENANT -> TENANT;
            case VISITED -> VISIT;
            case NONE -> null;
        };
    }
}
