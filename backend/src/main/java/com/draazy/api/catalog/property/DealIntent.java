package com.draazy.api.catalog.property;

public final class DealIntent {
    private DealIntent() {
    }

    public static final String BUY = "buy";

    public static final String RENT = "rent";

    public static final String PATTERN = BUY + "|" + RENT;

    public static final String PATTERN_MESSAGE = "must be buy or rent";

    public static final String UNIT_TOTAL = "total";

    public static final String UNIT_PER_MONTH = "per-month";

    public static String priceUnitFor(String deal) {
        return RENT.equals(deal) ? UNIT_PER_MONTH : UNIT_TOTAL;
    }
}
