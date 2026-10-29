package com.draazy.api.moderation.report;

import java.util.Set;

public final class ReportEnforcement {
    private ReportEnforcement() {
    }

    public static final String NONE = "none";

    public static final String HIDE_CONTENT = "hide_content";

    public static final String SUSPEND_ACCOUNT = "suspend_account";

    private static final Set<String> ALL = Set.of(NONE, HIDE_CONTENT, SUSPEND_ACCOUNT);

    private static final Set<String> FOR_PROPERTY = Set.of(NONE, HIDE_CONTENT);
    private static final Set<String> FOR_POST = Set.of(NONE, HIDE_CONTENT);
    private static final Set<String> FOR_USER = Set.of(NONE, SUSPEND_ACCOUNT);
    private static final Set<String> DECIDE_ONLY = Set.of(NONE);

    public static boolean isValid(String value) {
        return ALL.contains(value);
    }

    public static Set<String> forTarget(String targetType) {
        return switch (targetType) {
            case ReportTargetTypes.PROPERTY -> FOR_PROPERTY;
            case ReportTargetTypes.POST -> FOR_POST;
            case ReportTargetTypes.USER -> FOR_USER;
            default -> DECIDE_ONLY;
        };
    }

    public static boolean isSupported(String targetType, String enforcement) {
        return forTarget(targetType).contains(enforcement);
    }

    public static String refusalFor(String targetType, String enforcement) {
        String base = "'%s' cannot be carried out against a %s from the report queue."
                .formatted(enforcement, targetType);
        return switch (targetType) {
            case ReportTargetTypes.REVIEW -> base
                    + " Take a review down with PATCH /reviews/{id}/status (status=rejected),"
                    + " which also removes it from the rating average.";
            default -> base + " Expected one of " + forTarget(targetType) + ".";
        };
    }
}
