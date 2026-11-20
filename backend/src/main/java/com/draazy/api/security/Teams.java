package com.draazy.api.security;

import java.util.List;
import java.util.Set;

public final class Teams {
    private Teams() {
    }

    public static final String RENTAL = "rental";
    public static final String LEGAL = "legal";
    public static final String LOANS = "loans";
    public static final String INTERIOR = "interior";
    public static final String PACKERS = "packers";
    public static final String VALUATION = "valuation";

    private static final Set<String> ALL =
            Set.of(RENTAL, LEGAL, LOANS, INTERIOR, PACKERS, VALUATION);

    public static boolean isKnown(String team) {
        return team != null && ALL.contains(team);
    }

    public static List<String> known() {
        return ALL.stream().sorted().toList();
    }
}
