package com.draazy.api.catalog.society;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

final class SocietyMatching {
    static final double FLOOR = 0.34;

    static final double LOCALITY_BOOST = 0.25;

    static final double NEAR_BOOST = 0.25;

    static final double NEAR_METRES = 100;

    static final double NEARBY_METRES = 250;

    static final double LAT_BOX = 0.00225;

    static final double LNG_BOX = 0.0024;

    private static final double EARTH_RADIUS_METRES = 6_371_000;

    private static final Set<String> NAME_STOPWORDS = Set.of(
            "the", "of", "by", "and", "society", "apartments", "apartment", "residency",
            "residences", "homes", "phase", "wing", "tower", "towers", "co", "op", "chs",
            "ltd", "pune");

    private SocietyMatching() {
    }

    static Set<String> tokens(String name) {
        return Arrays.stream((name == null ? "" : name)
                        .toLowerCase(Locale.ROOT).split("[^a-z0-9]+"))
                .filter(t -> t.length() > 1 && !NAME_STOPWORDS.contains(t))
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    static double nameScore(Set<String> mine, Set<String> theirs) {
        long shared = theirs.stream().filter(mine::contains).count();
        long union = mine.size() + theirs.size() - shared;
        return union == 0 ? 0 : (double) shared / union;
    }

    static double metresBetween(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(a));
    }
}
