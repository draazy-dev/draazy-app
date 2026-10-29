package com.draazy.api.engagement.review;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public final class ReviewCategories {
    private ReviewCategories() {
    }

    public static final String LOCALITY = "locality";
    public static final String CONDITION = "condition";
    public static final String VALUE = "value";
    public static final String OWNER = "owner";
    public static final String ACCURACY = "accuracy";

    public static final Set<String> PROPERTY_KEYS =
            Set.of(LOCALITY, CONDITION, VALUE, OWNER, ACCURACY);

    public static final String SAFETY = "Safety";
    public static final String MAINTENANCE = "Maintenance";
    public static final String MANAGEMENT = "Management";
    public static final String AMENITIES = "Amenities";
    public static final String CONNECTIVITY = "Connectivity";

    public static final Set<String> SOCIETY_KEYS =
            Set.of(SAFETY, MAINTENANCE, MANAGEMENT, AMENITIES, CONNECTIVITY);

    private static final int MIN = 1;
    private static final int MAX = 5;

    public static Set<String> forTarget(String targetType) {
        return ReviewTargetTypes.SOCIETY.equals(targetType) ? SOCIETY_KEYS : PROPERTY_KEYS;
    }

    public static Map<String, Integer> validated(String targetType,
            Map<String, Integer> submitted) {
        Set<String> allowed = forTarget(targetType);
        Map<String, Integer> clean = new LinkedHashMap<>();
        if (submitted == null || submitted.isEmpty()) {
            return clean;
        }
        submitted.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(Comparator.naturalOrder()))
                .forEach(e -> {
                    if (!allowed.contains(e.getKey())) {
                        throw new IllegalArgumentException(
                                "Unknown review category '" + e.getKey() + "' for a " + targetType
                                        + " review; allowed: " + sortedKeys(allowed));
                    }
                    Integer v = e.getValue();
                    if (v == null) {
                        return;
                    }
                    if (v < MIN || v > MAX) {
                        throw new IllegalArgumentException(
                                "Review category '" + e.getKey() + "' must be between "
                                        + MIN + " and " + MAX + ", got " + v);
                    }
                    clean.put(e.getKey(), v);
                });
        return clean;
    }

    private static String sortedKeys(Set<String> allowed) {
        return allowed.stream().sorted().toList().toString();
    }
}
