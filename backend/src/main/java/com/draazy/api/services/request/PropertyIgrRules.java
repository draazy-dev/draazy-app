package com.draazy.api.services.request;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

final class PropertyIgrRules {

    private static final int MAX_AREA = 100_000;
    private static final Set<String> AREA_UNITS = Set.of("sqft", "sqm");
    private static final Set<String> TALUKAS = Set.of("Pune City", "Haveli", "Mulshi", "Maval", "Khed",
            "Shirur", "Daund", "Indapur", "Baramati", "Purandar", "Bhor", "Velhe / Rajgad", "Junnar",
            "Ambegaon", "Pimpri-Chinchwad / Pimpri");

    private static final Pattern NUMBER = Pattern.compile("^[0-9]+(?:\\.[0-9]+)?$");

    private PropertyIgrRules() {
    }

    static void check(Map<String, Object> prop, Map<String, Object> terms, List<String> problems) {
        if (prop.containsKey("taluka")) {
            required(prop.get("taluka"), "_state.prop.taluka", problems);
            oneOf(prop.get("taluka"), "_state.prop.taluka", TALUKAS, problems);
        }
        text(prop, "landmark", 80, problems);
        text(prop, "policeStation", 80, problems);
        text(prop, "roadVicinity", 80, problems);
        text(prop, "roadType", 80, problems);

        optionalArea(terms.get("parkingArea"), "_state.terms.parkingArea", problems);
        unit(terms.get("parkingAreaUnit"), "_state.terms.parkingAreaUnit", problems);
        if (isStated(terms.get("parkingArea")) && "none".equals(String.valueOf(terms.get("parking")))) {
            problems.add("_state.terms.parkingArea requires parking to be included");
        }
    }


    private static void text(Map<String, Object> prop, String key, int max, List<String> problems) {
        if (prop.containsKey(key)) {
            required(prop.get(key), "_state.prop." + key, problems);
            max(prop.get(key), "_state.prop." + key, max, problems);
        }
    }


    private static void optionalArea(Object raw, String path, List<String> problems) {
        if (!isStated(raw)) {
            return;
        }
        String text = raw.toString().trim();
        if (!NUMBER.matcher(text).matches()) {
            problems.add(path + " must be a number from 1 to " + MAX_AREA);
            return;
        }
        BigDecimal value = new BigDecimal(text);
        if (value.compareTo(BigDecimal.ONE) < 0 || value.compareTo(BigDecimal.valueOf(MAX_AREA)) > 0
                || value.scale() > 2) {
            problems.add(path + " must be a number from 1 to " + MAX_AREA + " with at most two decimals");
        }
    }

    private static void unit(Object raw, String path, List<String> problems) {
        if (isStated(raw) && !AREA_UNITS.contains(raw.toString())) {
            problems.add(path + " must be one of " + String.join(", ", new java.util.TreeSet<>(AREA_UNITS)));
        }
    }

    private static void oneOf(Object raw, String path, Set<String> allowed, List<String> problems) {
        if (isStated(raw) && !allowed.contains(raw.toString())) {
            problems.add(path + " must be one of " + String.join(", ", new java.util.TreeSet<>(allowed)));
        }
    }

    private static void required(Object value, String path, List<String> problems) {
        if (!isStated(value)) {
            problems.add(path + " is required");
        }
    }

    private static void max(Object raw, String path, int max, List<String> problems) {
        if (isStated(raw) && raw.toString().trim().length() > max) {
            problems.add(path + " must be at most " + max + " characters");
        }
    }

    private static boolean isStated(Object value) {
        return value != null && !value.toString().isBlank();
    }
}
