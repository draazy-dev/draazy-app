package com.draazy.api.moderation.report;

import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public final class ReportReasons {
    private ReportReasons() {
    }

    public static final String OTHER = "other";

    private static final Set<String> FOR_PROPERTY =
            Set.of("sold", "fake", "unavailable", "pricing", "spam", "broker", OTHER);

    private static final Set<String> FOR_USER =
            Set.of("impersonation", "fraud", "brokerage", "abuse", "spam", "fakelistings", OTHER);

    private static final Set<String> FOR_POST =
            Set.of("fake", "unavailable", "filled", "broker", "inappropriate", "spam", OTHER);

    private static final Set<String> FOR_REVIEW = Set.of("fake", "abuse", OTHER);

    public static Set<String> forTarget(String targetType) {
        return switch (targetType == null ? "" : targetType) {
            case ReportTargetTypes.PROPERTY -> FOR_PROPERTY;
            case ReportTargetTypes.USER -> FOR_USER;
            case ReportTargetTypes.POST -> FOR_POST;
            case ReportTargetTypes.REVIEW -> FOR_REVIEW;
            default -> Set.of();
        };
    }

    public static boolean isValid(String targetType, String reason) {
        return forTarget(targetType).contains(reason);
    }

    public static boolean isKnown(String reason) {
        return ANY.contains(reason);
    }

    private static final Set<String> ANY =
            Stream.of(FOR_PROPERTY, FOR_USER, FOR_POST, FOR_REVIEW)
                    .flatMap(Set::stream)
                    .collect(Collectors.toUnmodifiableSet());
}
