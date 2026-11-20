package com.draazy.api.catalog.property;

public final class LandUse {
    private LandUse() {
    }

    public static final String RESIDENTIAL = "residential";

    public static final String COMMERCIAL = "commercial";

    public static final String INDUSTRIAL = "industrial";

    public static final String AGRICULTURAL = "agricultural";

    public static final String MIXED = "mixed";

    public static final String PATTERN =
            RESIDENTIAL + "|" + COMMERCIAL + "|" + INDUSTRIAL + "|" + AGRICULTURAL + "|" + MIXED;

    public static final String PATTERN_MESSAGE =
            "must be residential, commercial, industrial, agricultural or mixed";
}
