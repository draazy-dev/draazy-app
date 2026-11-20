package com.draazy.api.moderation.report;

public final class ReportTargetTypes {
    private ReportTargetTypes() {
    }

    public static final String PROPERTY = "property";

    public static final String USER = "user";

    public static final String REVIEW = "review";

    public static final String POST = "post";

    public static boolean isValid(String value) {
        return PROPERTY.equals(value) || USER.equals(value)
                || REVIEW.equals(value) || POST.equals(value);
    }
}
