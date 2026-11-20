package com.draazy.api.catalog.property;

import java.util.Locale;

public enum PropertyKind {
    COMMERCIAL, HOUSE, FLAT, VILLA, FARMLAND, PLOT;

    public static PropertyKind of(String label) {
        if (label == null) {
            return null;
        }
        String l = label.toLowerCase(Locale.ROOT);
        if (hasAny(l, "office", "shop", "showroom", "retail", "commercial", "warehouse", "godown",
                "industrial", "co-working", "coworking")) {
            return COMMERCIAL;
        }
        if (hasAny(l, "independent house", "row house", "villa / house")) {
            return HOUSE;
        }
        if (hasAny(l, "flat", "studio", "penthouse", "apartment")) {
            return FLAT;
        }
        if (l.contains("villa")) {
            return VILLA;
        }
        if (hasAny(l, "farm land", "farmland")) {
            return FARMLAND;
        }
        return l.contains("plot") ? PLOT : null;
    }

    public boolean isResidential() {
        return this == HOUSE || this == FLAT || this == VILLA;
    }

    public boolean isLand() {
        return this == FARMLAND || this == PLOT;
    }

    public static boolean carriesBhk(String label) {
        PropertyKind kind = of(label);
        return kind == null || kind.isResidential();
    }

    private static boolean hasAny(String label, String... tokens) {
        for (String token : tokens) {
            if (label.contains(token)) {
                return true;
            }
        }
        return false;
    }
}
