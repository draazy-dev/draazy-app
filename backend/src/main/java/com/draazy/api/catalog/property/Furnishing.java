package com.draazy.api.catalog.property;

public final class Furnishing {
    private Furnishing() {
    }

    public static final String UNFURNISHED = "unfurnished";

    public static final String SEMI_FURNISHED = "semi-furnished";

    public static final String FURNISHED = "furnished";

    public static final String PATTERN = UNFURNISHED + "|" + SEMI_FURNISHED + "|" + FURNISHED;

    public static final String PATTERN_MESSAGE =
            "must be unfurnished, semi-furnished or furnished";
}
