package com.draazy.api.catalog.property;

import java.math.BigDecimal;
import java.util.List;

public final class AreaUnit {
    private AreaUnit() {
    }

    public static final String SQFT = "sqft";

    public static final String SQYD = "sqyd";

    public static final String SQM = "sqm";

    public static final String GUNTHA = "guntha";

    public static final String ACRE = "acre";

    public static final String HECTARE = "hectare";

    public static final String PATTERN =
            SQFT + "|" + SQYD + "|" + SQM + "|" + GUNTHA + "|" + ACRE + "|" + HECTARE;

    public static final String PATTERN_MESSAGE =
            "must be sqft, sqyd, sqm, guntha, acre or hectare";

    public static BigDecimal sqftPer(String unit) {
        return switch (unit == null ? SQFT : unit) {
            case SQYD -> BigDecimal.valueOf(9);
            case SQM -> new BigDecimal("10.7639");
            case GUNTHA -> BigDecimal.valueOf(1089);
            case ACRE -> BigDecimal.valueOf(43560);
            case HECTARE -> new BigDecimal("107639.1");
            default -> BigDecimal.ONE;
        };
    }

    public static boolean offeredFor(PropertyKind kind, String unit) {
        if (unit == null || kind == null) {
            return true;
        }
        return switch (kind) {
            case PLOT -> List.of(SQFT, SQYD, SQM, GUNTHA).contains(unit);
            case FARMLAND -> List.of(ACRE, GUNTHA, HECTARE).contains(unit);
            default -> SQFT.equals(unit);
        };
    }
}
