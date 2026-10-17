package com.draazy.api.catalog.property;

import java.math.BigDecimal;
import java.util.List;

/** Units a stated area may be measured in. No {@code CHECK} stands behind the column, so this regex is the
 * whole constraint on text rendered verbatim on the public page; {@code null} means sq.ft. */
public final class AreaUnit {

    private AreaUnit() {
    }

    public static final String SQFT = "sqft";

    public static final String SQYD = "sqyd";

    public static final String SQM = "sqm";

    public static final String GUNTHA = "guntha";

    public static final String ACRE = "acre";

    public static final String HECTARE = "hectare";

    /** Bean-Validation regex accepting exactly the five units. Composed from the constants rather
     * than hand-written so the accepted input set cannot drift from the domain. */
    public static final String PATTERN =
            SQFT + "|" + SQYD + "|" + SQM + "|" + GUNTHA + "|" + ACRE + "|" + HECTARE;

    public static final String PATTERN_MESSAGE =
            "must be sqft, sqyd, sqm, guntha, acre or hectare";

    /** One unit in sq.ft; the same factors {@code PropertySpecs} filters by. */
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

    /** The units the wizard offers for a kind of property; {@code null} means "no unit stated". */
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
